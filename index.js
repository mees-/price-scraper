const puppeteer = require('puppeteer')
const delay = require('delay')
const PQueue = require('p-queue')

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
  try {
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

    await page.close()
    return price
  } catch (e) {
    await page.close()
    throw e
  }
}

const KM_PER_YEAR = 1200

const input = require('./data.json')
const output = []

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  })

  const queue = new PQueue({ concurrency: 5 })

  input
    .map(row => async () => {
      output.push(await addPrice(row, browser))
      console.log(`progress: ${(output.length / input.length) * 100}%`)
    })
    .forEach(fn => queue.add(fn))

  // for (const entry of input) {
  //   for (const page of await browser.pages()) {
  //     await page.close()
  //   }

  //   const years =
  //     (new Date() -
  //       new Date(
  //         `${entry.Datumeerstetoelating.slice(
  //           0,
  //           4,
  //         )}-${entry.Datumeerstetoelating.slice(
  //           4,
  //           6,
  //         )}-${entry.Datumeerstetoelating.slice(6)}`,
  //       )) /
  //     (1000 * 60 * 60 * 24 * 365)

  //   if (years >= 15) {
  //     console.log(`Skipping ${entry.Kenteken}, it's too old (${years} old)`)
  //     output.push({ ...entry, prijs: '-1' })
  //     continue
  //   }
  //   const kilometers = KM_PER_YEAR * years

  //   try {
  //     const price = await getPrice(
  //       entry.Kenteken,
  //       kilometers.toString().split('.')[0],
  //       browser,
  //     )
  //     console.log(`prijs voor ${entry.Kenteken}: ${price}`)
  //     console.log(`progress: ${(output.length / input.length) * 100}%`)
  //     output.push({ ...entry, prijs: price })
  //   } catch (e) {
  //     console.error(
  //       `failed to get price for ${entry.Kenteken}, kilometers: ${
  //         kilometers.toString().split('.')[0]
  //       }`,
  //     )
  //     output.push({ ...entry, prijs: '-1' })
  //   }
  // }
  await browser.close()

  require('fs').writeFileSync('./data2.json', JSON.stringify(output), {
    encoding: 'utf8',
  })
})()

const addPrice = async (entry, browser) => {
  const years =
    (new Date() -
      new Date(
        `${entry.Datumeerstetoelating.slice(
          0,
          4,
        )}-${entry.Datumeerstetoelating.slice(
          4,
          6,
        )}-${entry.Datumeerstetoelating.slice(6)}`,
      )) /
    (1000 * 60 * 60 * 24 * 365)

  if (years >= 15) {
    console.log(`Skipping ${entry.Kenteken}, it's too old (${years} old)`)
    return { ...entry, prijs: '-1' }
  }
  const kilometers = KM_PER_YEAR * years
  const page = await browser.newPage()
  try {
    const price = await getPrice(
      entry.Kenteken,
      kilometers.toString().split('.')[0],
      page,
    )
    console.log(`prijs voor ${entry.Kenteken}: ${price}`)
    console.log(`progress: ${(output.length / input.length) * 100}%`)
    page.close()
    return { ...entry, prijs: price }
  } catch (e) {
    console.error(
      `failed to get price for ${entry.Kenteken}, kilometers: ${
        kilometers.toString().split('.')[0]
      }`,
    )
    page.close()
    return { ...entry, prijs: '-1' }
  }
}
