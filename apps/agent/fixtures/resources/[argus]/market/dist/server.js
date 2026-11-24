const catalog = {
    bandage: { name: "Bandage", price: { amount: 150 } },
    radio: { name: "Radio" }
};
function priceOf(itemName) {
    const item = catalog[itemName];
    return item.price.amount;
}
onNet("market:buy", (itemName) => {
    emitNet("market:price", source, priceOf(itemName));
});
//# sourceMappingURL=server.js.map