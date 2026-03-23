import migrateDatabase from './migrations'
import initModels from './models'
import fileState from '../../../../../utils/fileState'
const { Sequelize, Op } = require('sequelize')

let sequelize
let models

function clean () {
  if (sequelize) {
    return sequelize.drop()
  }
}

async function deleteAllRecords () {
  await models.File.destroy({
    where: {},
    truncate: true
  })
  await models.Stream.destroy({
    where: {},
    truncate: true
  })
}

function addHooks () {
  models.File.addHook('afterBulkCreate', async (files, options) => {
    if (files.length <= 0) return
    // updateStreamLastModifiedAt
    const data = {id: files[0].streamId, params: {lastModifiedAt: new Date()}}
    await collections.streams.update(data)
  })
}

async function init (app) {
  try {
    const storage = `${app.getPath('userData')}/database.sqlite`
    console.info('[DB] Initializaing database...', storage)
    sequelize = new Sequelize('database', 'username', 'password', {
      host: 'localhost',
      dialect: 'sqlite',
      define: {
        underscored: true,
        timestamps: true
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: false,
      storage,
      operatorsAliases: {
        $lt: Op.lt,
        $gt: Op.gt,
        $gte: Op.gte,
        $like: Op.like,
        $nin: Op.notIn,
        $nLike: Op.notLike,
        $and: Op.and,
        $ne: Op.ne
      }
    })
    await sequelize.authenticate()
    console.info('[DB] Database connection has been established successfully.')
    await migrateDatabase(sequelize)
    models = initModels(sequelize)
    addHooks()
    console.info('[DB] Database models initialized successfully: ', Object.keys(models))
  } catch (err) {
    console.error('[DB] Error occured during database initialization.', err)
  }
}

const collections = {
  files: {
    bulkCreate: function (data) {
      console.info(`[DB] db.files.bulkCreate: ${data.length} files`)
      return models.File.bulkCreate(data, {
        validate: false, // assume data is correct for speed boost
        ignoreDuplicates: true
      })
    },
    update: function (data) {
      console.info(`[DB] db.files.update: ${data.id} ${JSON.stringify(data.params)}`)
      return models.File.findOne({ where: { id: data.id } })
        .then((file) => {
          ['durationInSecond', 'state', 'uploadId', 'stateMessage', 'progress', 'format', 'sessionId',
            'retries', 'uploaded', 'uploadedTime', 'timestamp', 'name', 'path', 'deploymentId', 'deviceId'].forEach((a) => {
            if (data.params[a] !== undefined) {
              file[a] = data.params[a]
            }
          })
          return file.save()
        })
    },
    bulkUpdate: function (opts) {
      console.info(`[DB] db.files.bulkUpdate: ${JSON.stringify(opts.where)} ${JSON.stringify(opts.values)}`)
      const where = opts.where || null
      const values = opts.values || {}
      return models.File.update(values, { where })
    },
    delete: function (opts) {
      // console.info(`[DB] db.files.delete: ${opts}`)
      return models.File.destroy({ where: opts.where })
        .then(() => {
          return sequelize.query('VACUUM;', { type: sequelize.QueryTypes.RAW })
        })
    },
    query: function (opts = {}) {
      // console.log('Database files.query is called', opts)
      const where = opts.where || null
      const order = opts.order || null
      const limit = opts.limit || null
      const offset = opts.offset || null
      return models.File.findAll({ where, order, limit, offset })
        .then((files) => files.map(f => f.toJSON()))
    },
    deleteAll: function () {
      console.info('[DB] db.files.deleteAll')
      return models.File.destroy({
        where: {},
        truncate: true
      })
    },
    sessionCount: function (sessionId) {
      return models.File.findAll({
        where: {session_id: sessionId},
        group: 'state',
        attributes: ['state', [sequelize.fn('COUNT', 'state'), 'stateCount']]
      }).then(states => {
        return states.map(s => s.dataValues)
      })
    },
    filesInStreamCount: function (streamId) {
      return models.File.findAll({
        where: {stream_id: streamId},
        group: 'state',
        attributes: ['state', [sequelize.fn('COUNT', 'state'), 'stateCount']]
      }).then(states => {
        return states.map(s => s.dataValues)
      })
    },
    getNumberOfRetryableFiles: function (streamId) {
      return models.File.findAll({
        where: {
          stream_id: streamId,
          state: fileState.state.ERROR_SERVER
        }
      }).then(files => {
        return files.filter(file => fileState.canRedo(file.state, file.stateMessage)).length
      })
    },
    getNumberOfWaitingFiles: function (streamId) {
      return models.File.findAll({
        where: {
          stream_id: streamId,
          state: [fileState.state.WAITING]
        }
      }).then(files => { return files.length })
    },
    filesInStreamsCount: function (streamIds) {
      return models.File.findAll({
        where: {stream_id: streamIds},
        group: ['state', 'stream_id'],
        attributes: ['state', 'streamId', [sequelize.fn('COUNT', 'state'), 'stateCount']]
      }).then(states => {
        return states.map(s => s.dataValues)
      })
    }
  },
  streams: {
    get: function (id) {
      console.info(`[DB] db.streams.get: ${id}`)
      return models.Stream.findOne({ where: { id } })
        .then(s => s ? s.toJSON() : s)
    },
    create: function (data) {
      console.info(`[DB] db.streams.create: ${data}`)
      return models.Stream.create(data)
        .then(s => s.toJSON())
    },
    bulkCreate: function (data) {
      console.info(`[DB] db.streams.bulkCreate: ${data.length} streams`)
      return models.Stream.bulkCreate(data, {
        validate: false // assume data is correct for speed boost
      })
    },
    upsert: function (data) {
      console.info(`[DB] db.streams.upsert: ${data}`)
      return data.map(item => {
        return models.Stream.upsert(item, {
          validate: false // assume data is correct for speed boost
        })
      })
    },
    update: function (data) {
      console.info(`[DB] db.streams.update: ${data}`)
      return models.Stream.findOne({ where: { id: data.id } })
        .then((stream) => {
          ['name', 'latitude', 'longitude', 'timezone', 'timestampFormat', 'lastModifiedAt'].forEach((a) => {
            if (data.params[a] !== undefined) {
              stream[a] = data.params[a]
            }
          })
          return stream.save()
        })
    },
    bulkUpdate: function (opts) {
      console.info(`[DB] db.streams.bulkUpdate: ${opts}`)
      const where = opts.where || null
      const values = opts.values || {}
      return models.Stream.update(values, { where })
    },
    deleteById: function (id) {
      console.info(`[DB] db.streams.deleteById: ${id}`)
      return collections.streams.delete({ where: { id } })
    },
    delete: function (opts) {
      console.info(`[DB] db.streams.delete: ${opts}`)
      return models.Stream.destroy({ where: opts.where })
        .then(() => {
          return sequelize.query('VACUUM;', { type: sequelize.QueryTypes.RAW })
        })
    },
    deleteAll: function () {
      console.info('[DB] db.streams.deleteAll')
      return models.Stream.destroy({
        where: {},
        truncate: true
      })
    },
    query: function (opts = {}) {
      // console.log('Database streams.query is called', opts)
      const where = opts.where || null
      const order = opts.order || null
      const limit = opts.limit || null
      const offset = opts.offset || null
      return models.Stream.findAll({ where, order, limit, offset })
        .then((streams) => streams.map(s => s.toJSON()))
    },
    getStreamsOrderByLastModified: function (opts = {}) {
      opts['order'] = [[sequelize.literal('CASE WHEN last_modified_at > server_updated_at THEN last_modified_at ELSE server_updated_at END DESC')]]
      return collections.streams.query(opts)
    },
    getStreamWithStats: async function (opts = {}) {
      const streams = await collections.streams.getStreamsOrderByLastModified(opts)
      const ids = streams.map(s => s.id)
      const stats = await collections.files.filesInStreamsCount(ids)
      return streams.map(stream => {
        const streamStats = stats.filter(state => state.streamId === stream.id)
        return {...stream, stats: streamStats}
      })
    }
  }
}

export default {
  init,
  clean,
  deleteAllRecords,
  collections
}
