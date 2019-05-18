const PQueue = require('p-queue')
const fs = require('fs-extra')
const { Transform } = require('stream')
const got = require('got')

const modelUrl = license =>
  `https://www.anwb.nl/auto/autodashboard/auto/models/${license}?applicatie=autodashboard`

const priceUrl = ({ modelID, license, plateYear, kilometers, newPrice }) =>
  `https://www.anwb.nl/auto/autodashboard/auto/ratelist?modelId=${modelID}&plate=${license}&licensePlate=${license}&plateY=${plateYear}&buildYear=${plateYear}&plateM=1&buildMonth=1&kilometerstand=${kilometers}&currentkm=${kilometers}&newPrice=${newPrice}&applicatie=autodashboard`

const KILOMTERS_PER_YEAR = 2000
const WRITE_ALL_CARS = false

let input = require('./data.json')
const totalSize = input.length
const output = fs.createWriteStream('./data-out.json')
output.write('[')
let done = 0

const queue = new PQueue({ concurrency: 100 })

queue.addAll(
  input.map(data => async () => {
    if (data.price > 0 || WRITE_ALL_CARS) {
      output.write(`${JSON.stringify(await getPrice(data))},`)
    }
    done++
    console.error(
      `progress: ${done / totalSize}% \t\tdone: ${done} of ${totalSize}`,
    )
  }),
)

input = []

queue.onEmpty().then(() => {
  output.write(']')
  output.close()
})

async function getPrice(data) {
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

  if (data.years >= 15) {
    return { ...data, price: -1 }
  }
  const modelurl = modelUrl(data['Kenteken'])
  console.error('getting model data')
  const modelData = (await got(modelurl, {
    json: true,
  })).body
  const model = modelData.resultList[0]

  const priceurl = priceUrl({
    modelID: model['uitvoeringID'],
    license: data.Kenteken,
    plateYear: model['jaarKenteken'],
    kilometers: Math.floor(data.kilometers),
    newPrice: model['laatstBekendeNieuwprijs'],
  })
  console.error('getting price data')
  const priceData = (await got(priceurl, {
    json: true,
  })).body

  const price = priceData['situaties'][3]['value']
  if (!price) {
    return { ...data, price: -2 }
  }
  return { ...data, price }
}
