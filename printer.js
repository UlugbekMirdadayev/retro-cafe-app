const escpos = require("escpos");
escpos.Network = require("escpos-network");
const settings = require("./settings");

function getPrinterDevice() {
  const ip = settings.getSettings().printerIp;
  return new escpos.Network(ip, 9100);
}

function printReceipt(template, data) {
  return new Promise((resolve, reject) => {
    const device = getPrinterDevice();
    const printer = new escpos.Printer(device, { encoding: "GB18030" });

    const text = renderTemplate(template.content, data);

    device.open(() => {
      printer.text(text).beep(3, 200).cut().close();
      resolve();
    });
  });
}

function testPrint() {
  return printReceipt({ content: "Test Print\nHello World!" }, {});
}

function renderTemplate(content, data) {
  let result = content;
  for (const key in data) {
    result = result.replace(`{${key}}`, data[key]);
  }
  return result;
}

module.exports = { printReceipt, testPrint };
