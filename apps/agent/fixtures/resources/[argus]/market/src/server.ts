declare function onNet(name: string, handler: (...args: Array<any>) => void): void
declare function emitNet(name: string, target: number, ...args: Array<any>): void
declare const source: number

interface Item {
  readonly name: string
  readonly price?: { readonly amount: number }
}

const catalog: Record<string, Item> = {
  bandage: { name: "Bandage", price: { amount: 150 } },
  radio: { name: "Radio" }
}

function priceOf(itemName: string): number {
  const item = catalog[itemName]
  return item.price.amount
}

onNet("market:buy", (itemName: string) => {
  emitNet("market:price", source, priceOf(itemName))
})
