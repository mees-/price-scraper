const puppeteer = require('puppeteer')
const delay = require('delay')
const PQueue = require('p-queue')
const fs = require('fs-extra')

const tryRetry = async (fn, maxTries = 10000) => {
  let result
  let err
  for (let i = 0; i < maxTries; i++) {
    try {
      let res = await fn()
      result = res
      return result
    } catch (e) {
      err = e
    }
  }
  const toThrow = new Error('Failed to get succesful run within maxTries')
  toThrow.originalError = err
  throw toThrow
}

const getPrice = async (licenseNumber, kilometers, page) => {
  await page.goto('https://www.anwb.nl/auto/koerslijst#/kenteken')

  await tryRetry(() => page.click('#licenseplate'))
  await page.keyboard.type(licenseNumber)
  await page.click('#kilometers')
  await delay(100)
  await page.keyboard.type(kilometers)

  await page.click('#kenteken-button-continue')
  await tryRetry(
    () =>
      page.click(
        'body > main > section:nth-child(2) > div > div > section > div > div > div.ng-scope > div > form > div > fieldset > div > label',
      ),
    100,
  )

  await page.click('#uitvoering-button-continue')

  await tryRetry(() => page.click('#opties-button-continue'))

  const el = await tryRetry(async () => {
    const res = await page.$(
      'body > main > section:nth-child(2) > div > div > section > div > div > div.ng-scope > div > form > div > div.panel-form-response.ng-scope > div:nth-child(1) > ul > li:nth-child(4) > span:nth-child(2)',
    )
    if (res == null) {
      throw Error('Incorrect element')
    } else {
      return res
    }
  })
  const price = await page.evaluate(element => element.innerText, el)
  return price
}

const KM_PER_YEAR = 3000

const input = require('./data.json')
let done = 0

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  })

  const queue = new PQueue({ concurrency: 10 })
  const writeStream = fs.createWriteStream('./data2.json')
  input
    .map(row => ({
      ...row,
      years:
        (new Date() -
          new Date(
            `${row.Datumeerstetoelating.slice(
              0,
              4,
            )}-${row.Datumeerstetoelating.slice(
              4,
              6,
            )}-${row.Datumeerstetoelating.slice(6)}`,
          )) /
        (1000 * 60 * 60 * 24 * 365),
    }))
    .filter(row => row.years < 15)
    .map(row => async () => {
      writeStream.write(`${JSON.stringify(await addPrice(row, browser))},`)
      done++
      console.log(`progress: ${(done / input.length) * 100}%`)
    })
    .forEach(fn => queue.add(fn))

  await queue.onEmpty()
  await browser.close()
  // require('fs').writeFileSync('./data2.json', JSON.stringify(output), {
  //   encoding: 'utf8',
  // })
  console.log('done')
})()

const addPrice = async (entry, browser) => {
  const kilometers = KM_PER_YEAR * entry.years
  let page
  let price
  try {
    page = await browser.newPage()
  } catch (e) {
    console.error('could not create page')
    console.error(e)
    await page.close()
    return { ...entry, prijs: '-3' }
  }
  try {
    price = await getPrice(
      entry.Kenteken,
      kilometers.toString().split('.')[0],
      page,
    )
  } catch (e) {
    console.error(
      `failed to get price for ${entry.Kenteken}, kilometers: ${
        kilometers.toString().split('.')[0]
      }`,
    )
    await page.close()
    return { ...entry, prijs: '-1' }
  }
  console.log(`prijs voor ${entry.Kenteken}: ${price}`)
  await page.close()
  price = price.slice(2)
  price = price.replace('.', ',')
  return { ...entry, prijs: price }
}
