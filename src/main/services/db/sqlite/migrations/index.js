const Sequelize = require('sequelize')
const sequelizeMetaTable = 'sequelize'
const migrations = [
  {
    name: '20210322000001-create-streams-table.js',
    file: require('./20210322000001-create-streams-table').default
  },
  {
    name: '20210322000002-create-files-table.js',
    file: require('./20210322000002-create-files-table').default
  },
  {
    name: '20210420000001-update-streams-table.js',
    file: require('./20210420000001-update-streams-table').default
  },
  {
    name: '20210521000001-update-streams-table.js',
    file: require('./20210521000001-update-streams-table').default
  },
  {
    name: '20210611000001-remove-non-on-going-sites.js',
    file: require('./20210611000001-remove-non-on-going-sites').default
  },
  {
    name: '20210613000001-change-state-to-int-files-table.js',
    file: require('./20210613000001-change-state-to-int-files-table').default
  }
]

function getCompletedMigrations (sequelize) {
  return sequelize.query(`SELECT name FROM ${sequelizeMetaTable}`, { type: Sequelize.QueryTypes.SELECT })
    .then(migrations => migrations.map(m => m.name))
}

async function getMigrations (sequelize) {
  const completedMigrations = await getCompletedMigrations(sequelize)
  return migrations.filter(m => (!completedMigrations.includes(m.name)))
}

function createSequelizeMetatable (sequelize) {
  return sequelize.query(`CREATE TABLE IF NOT EXISTS ${sequelizeMetaTable} (name VARCHAR(255) NOT NULL UNIQUE)`)
}

function saveMigrationMeta (sequelize, filename) {
  return sequelize.query(`INSERT INTO ${sequelizeMetaTable} VALUES (:name)`, { type: Sequelize.QueryTypes.INSERT, replacements: { name: filename } })
}

export default async function migrate (sequelize) {
  console.info('[DB] migration: starting...')
  await createSequelizeMetatable(sequelize)
  console.info('[DB] migration: sequelize meta table found or created.')
  const migrations = await getMigrations(sequelize)
  console.info(`[DB] migration: ${migrations.length} migrations to run.`)
  for (const migration of migrations) {
    const name = migration.name
    try {
      console.info(`[DB] migration: running "${name}".`)
      await migration.file.up(sequelize.queryInterface, Sequelize)
      console.info(`[DB] migration: saving "${name}" into sequelize meta table.`)
      await saveMigrationMeta(sequelize, name)
      console.info(`[DB] migration: "${name}" performed.`)
    } catch (err) {
      console.error(`[DB] migration: "${name}" failed`, err)
      break
    }
  }
  console.info('Database migration: ended.')
}
