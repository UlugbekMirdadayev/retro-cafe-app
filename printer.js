const escpos = require("escpos");
escpos.Network = require("escpos-network");
const WebSocket = require("ws");

// Printer konfiguratsiyasi
const PRINTER_IP = "192.168.123.100";
const PRINTER_PORT = 9100;

// Sodda ovoz funksiyasi
function playSound() {
  process.stdout.write("\x07");
  console.log("Check chiqarildi!");
}

// Asosiy printer funksiyasi - faqat ESC/POS orqali
async function sendToPrinter(data) {
  try {
    const device = new escpos.Network(PRINTER_IP, PRINTER_PORT);
    const printer = new escpos.Printer(device, { encoding: "CP866" });

    await new Promise((resolve, reject) => {
      device.open((error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log(`Printer bilan bog'landi: ${PRINTER_IP}:${PRINTER_PORT}`);

        // Kelgan xabarni to'g'ridan-to'g'ri chiqarish
        printer
          .text(data)
          .cut()
          .close((closeError) => {
            if (closeError) {
              console.error("Printer yopishda xato:", closeError.message);
            }
            playSound();
            resolve();
          });
      });
    });
  } catch (error) {
    console.error("Printer xatosi:", error.message);
  }
}

// WebSocket serveri - port 8080
const wss = new WebSocket.Server({ port: 8080 });

// Global qilish - main.js'dan kirish uchun
global.wss = wss;

console.log("WebSocket server 8080 portda ishlamoqda...");

wss.on("connection", (ws) => {
  console.log("Yangi WebSocket client ulandi");

  ws.on("message", (message) => {
    console.log("Kelgan xabar:", message.toString());

    // Kelgan xabarni to'g'ridan-to'g'ri printerga jo'natish - FAQAT BIR MARTA
    sendToPrinter(message.toString());
  });

  ws.on("close", () => {
    console.log("WebSocket client uzildi");
  });

  ws.on("error", (error) => {
    console.error("WebSocket xatosi:", error.message);
  });
});

// Server yopilishi eventi
wss.on("close", () => {
  console.log("WebSocket server yopildi");
});

// Test xabari - faqat bir marta
console.log("Test chiqarilmoqda...");
setTimeout(() => {
  const testData = `
================================
         RETRO CAFE             
================================
Test Check - ${new Date().toLocaleString()}
--------------------------------
Test mahsulot: 5000 so'm
--------------------------------
RAHMAT!
================================



`;
  sendToPrinter(testData);
}, 3000);

// Export
module.exports = { sendToPrinter };
