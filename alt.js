const fs = require('fs-extra')
const random = require('random')

const KILOMTERS_PER_YEAR = 2000
const BASE_PRICE = 15000
const WRITE_ALL_CARS = false
const HALF_TIME = 4

const input = require('./data.json')
const output = input.map(getPrice)

const headers = Object.keys(output[0])
const csvData = output.map(data => Object.values(data))

;[headers, ...csvData].forEach(line => {
  process.stdout.write(line.join('\t') + '\n')
})

function getPrice(data) {
  const years =
    (new Date() -
      new Date(
        `${data.Datumeerstetoelating.slice(
          0,
          4,
        )}-${data.Datumeerstetoelating.slice(
          4,
          6,
        )}-${data.Datumeerstetoelating.slice(6)}`,
      )) /
    (1000 * 60 * 60 * 24 * 365)

  data = { ...data, years }

  data = { ...data, kilometers: KILOMTERS_PER_YEAR * data.years }

  const randomFactor = (() => {
    const original = random.normal(1.1, 0.1)
    return () => {
      let res = original()
      while (Math.abs(res - 1.1) > 0.15) {
        res = original()
      }
      return res
    }
  })()
  price = BASE_PRICE * Math.pow(0.5, data.years / HALF_TIME) * randomFactor()
  return { ...data, price }
}
