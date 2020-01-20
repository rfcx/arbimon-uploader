const moment = require('moment')

const appDate = 'YYYY-MM-DD HH:mm:ss'

const parseTimestamp = (fileName, timestampFormat) => {
  const parts = {
    '%Y': '(?<year>[1-9][0-9][0-9][0-9])',
    '%y': '(?<year>[0-9][0-9])',
    '%M': '(?<month>[0-1][0-9])',
    '%D': '(?<day>[0-3][0-9])',
    '%H': '(?<hour>[0-2][0-9])',
    '%m': '(?<minute>[0-5][0-9])',
    '%s': '(?<second>[0-5][0-9])'
  }

  var regExpString = timestampFormat
  Object.keys(parts).forEach(key => {
    regExpString = regExpString.replace(key, parts[key])
  })

  const regExp = new RegExp(regExpString, 'g')
  var result = regExp.exec(fileName)

  // Not matched
  if (result == null) {
    return undefined
  }

  result = result.groups

  // Fix 2 character years
  if (result && result.year && result.year.length === 2) result.year = '20' + result.year
  return `${result.year}-${result.month}-${result.day}T${result.hour}:${result.minute}:${result.second}Z`
}

const parseTimestampAuto = (input) => {
  // Test "year month day", "day month year", "[a-zA-Z]{3}[0-9]{4} year month day", "[a-zA-Z]{6} [a-zA-Z]{3} [a-zA-Z]{3} [a-zA-Z]{3} [a-zA-Z]{2}[0-9]{2} year month day"
  const test1 = '(?<year>(19|20)[0-9][0-9])[- /.]?(?<month>0[1-9]|1[012])[- /.]?(?<day>0[1-9]|[12][0-9]|3[01]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9])'
  const test2 = '(?<day>0[1-9]|[12][0-9]|3[01])[- /.]?(?<month>0[1-9]|1[012])[- /.]?(?<year>(19|20)[0-9][0-9]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9])'
  const test3 = '(?<string>[a-zA-Z]{3}[0-9]{4})[-._ ]?(?<year>(19|20)[0-9][0-9])[- /._]?(?<month>0[1-9]|1[012])[- /._]?(?<day>0[1-9]|[12][0-9]|3[01]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9])'
  const test4 = '(?<string>[a-zA-Z]{6}[-._ ]?[a-zA-Z]{3}[-._ ]?[a-zA-Z]{3}[-._ ]?[a-zA-Z]{3}[-._ ]?[a-zA-Z]{2}[0-9]{2})[-._ ]?(?<year>(19|20)[0-9][0-9])[- /._]?(?<month>0[1-9]|1[012])[- /._]?(?<day>0[1-9]|[12][0-9]|3[01]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9])'
  const regExp3 = new RegExp(test3, 'g')
  var result = regExp3.exec(input)
  if (result == null) {
    const regExp4 = new RegExp(test4, 'g')
    result = regExp4.exec(input)
    if (result == null) {
      const regExp1 = new RegExp(test1, 'g')
      result = regExp1.exec(input)
      if (result == null) {
        const regExp2 = new RegExp(test2, 'g')
        result = regExp2.exec(input)
        if (result == null) {
          return undefined
        }
      }
    }
  }
  result = result.groups
  // Fix 2 character years
  if (result.year.length === 2) result.year = '20' + result.year
  return `${result.year}-${result.month}-${result.day}T${result.hour}:${result.minute}:${result.second}Z`
}

const getMomentDateFromISODate = (date) => {
  return moment.utc(date, moment.ISO_8601)
}

const getMomentDateFromAppDate = (date) => {
  return moment.utc(date, appDate)
}

const convertMomentDateToAppDate = (date) => {
  return date.format(appDate)
}

const isValidDate = (date) => {
  return date.isValid()
}

export default {
  appDate,
  parseTimestamp,
  parseTimestampAuto,
  getMomentDateFromISODate,
  getMomentDateFromAppDate,
  convertMomentDateToAppDate,
  isValidDate
}
