const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
require("dotenv").config();

let backendProcess;
let mainWindow;
let serverStatus = "stopped"; // stopped, starting, running, error
let currentPort = 8080; // default port

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    minHeight: 600,
    minWidth: 800,
    maxWidth: 1920,
    maxHeight: 1000,
    zoomToPageWidth: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("index.html");
  mainWindow = win;
  return win;
}

// Portlar va ulardagi servislar haqida batafsil ma'lumot
function getPortsWithProcessInfo() {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    let command;

    if (process.platform === "win32") {
      // Windows uchun port va process ma'lumotlarini olish
      command = "netstat -ano | findstr LISTENING";
    } else {
      // Linux/Mac uchun
      command = "ss -tlnp";
    }

    exec(command, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }

      const ports = [];
      
      const lines = stdout.trim().split("\n");

      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          let portInfo = {};

          if (process.platform === "win32") {
            // Windows: TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING 1234
            const addressPort = parts[1];
            const pid = parts[parts.length - 1];

            if (addressPort && addressPort.includes(":")) {
              const port = addressPort.split(":").pop();
              const portNum = parseInt(port);
              const pidNum = parseInt(pid);

              if (portNum && portNum > 0 && portNum < 65536) {
                portInfo = {
                  port: portNum,
                  pid: pidNum || 0,
                  protocol: parts[0] || "TCP",
                  address: addressPort.split(":")[0] || "0.0.0.0",
                  processName: "Unknown",
                };

                // PID orqali process nomini olish
                if (pidNum) {
                  exec(
                    `tasklist /FI "PID eq ${pidNum}" /FO CSV /NH`,
                    (err, processOutput) => {
                      if (!err && processOutput) {
                        const processLines = processOutput.trim().split("\n");
                        if (processLines.length > 0) {
                          const processData = processLines[0].split(",");
                          if (processData.length > 0) {
                            portInfo.processName =
                              processData[0].replace(/"/g, "") || "Unknown";
                          }
                        }
                      }
                    }
                  );
                }

                ports.push(portInfo);
              }
            }
          } else {
            // Linux format: *:8080 users:(("node",pid=1234,fd=10))
            // Parse this format for Linux systems
            if (parts[0] && parts[0].includes(":")) {
              const port = parts[0].split(":").pop();
              const portNum = parseInt(port);

              if (portNum && portNum > 0 && portNum < 65536) {
                let processName = "Unknown";
                let pid = 0;

                // Extract process info from users:((... format
                const usersInfo = parts.find((part) => part.includes("users:"));
                if (usersInfo) {
                  const match = usersInfo.match(/\("([^"]+)",pid=(\d+)/);
                  if (match) {
                    processName = match[1];
                    pid = parseInt(match[2]);
                  }
                }

                portInfo = {
                  port: portNum,
                  pid: pid,
                  protocol: "TCP",
                  address: parts[0].split(":")[0] || "*",
                  processName: processName,
                };

                ports.push(portInfo);
              }
            }
          }
        }
      });

      // Duplicate portlarni olib tashlash va sort qilish
      const uniquePorts = ports.reduce((acc, current) => {
        const existing = acc.find((port) => port.port === current.port);
        if (!existing) {
          acc.push(current);
        }
        return acc;
      }, []);

      resolve(uniquePorts.sort((a, b) => a.port - b.port));
    });
  });
}

// Faol portlarni tekshirish funksiyasi (eski funksiya, compatibility uchun)
function getActivePorts() {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    let command;

    if (process.platform === "win32") {
      command = "netstat -an | findstr LISTENING";
    } else {
      command = "netstat -tuln | grep LISTEN";
    }

    exec(command, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }

      const ports = [];
      const lines = stdout.trim().split("\n");

      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          let addressPort;
          if (process.platform === "win32") {
            addressPort = parts[1]; // Windows: TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING
          } else {
            addressPort = parts[3]; // Linux: tcp 0 0 0.0.0.0:8080 0.0.0.0:* LISTEN
          }

          if (addressPort && addressPort.includes(":")) {
            const port = addressPort.split(":").pop();
            const portNum = parseInt(port);
            if (portNum && portNum > 0 && portNum < 65536) {
              if (!ports.includes(portNum)) {
                ports.push(portNum);
              }
            }
          }
        }
      });

      resolve(ports.sort((a, b) => a - b));
    });
  });
}

// Port ni bo'shatish funksiyasi
function killPortProcess(port = currentPort) {
  return new Promise((resolve) => {
    let killCommand;
    if (process.platform === "win32") {
      killCommand = `netstat -ano | findstr :${port}`;
    } else {
      killCommand = `lsof -ti:${port}`;
    }

    const { exec } = require("child_process");
    exec(killCommand, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(false);
        return;
      }

      if (process.platform === "win32") {
        // Windows uchun PID ni ajratib olish va to'xtatish
        const lines = stdout.trim().split("\n");
        const pids = lines
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            return parts[parts.length - 1]; // oxirgi element PID
          })
          .filter((pid) => pid && pid !== "0");

        if (pids.length > 0) {
          pids.forEach((pid) => {
            exec(`taskkill /PID ${pid} /F`, (err) => {
              if (err)
                console.log(`PID ${pid} ni to'xtatishda xatolik:`, err.message);
            });
          });
        }
      } else {
        // Linux/Mac uchun
        exec(`kill -9 ${stdout.trim()}`, (err) => {
          if (err)
            console.log("Port processini to'xtatishda xatolik:", err.message);
        });
      }

      resolve(true);
    });
  });
}

// Server statusini tekshirish funksiyasi
function checkServerStatus(port = currentPort) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: port,
        timeout: 2000,
        method: "GET",
      },
      (res) => {
        resolve(true);
      }
    );

    req.on("error", () => {
      resolve(false);
    });

    req.on("timeout", () => {
      resolve(false);
    });

    req.end();
  });
}

// Status o'zgarishini UI ga yuborish
function updateServerStatus(status, message = "") {
  serverStatus = status;
  if (mainWindow) {
    mainWindow.webContents.send("server-status-changed", { status, message });
  }
}

function runBackend(backendPath) {
  if (!backendPath || !fs.existsSync(backendPath)) {
    console.log("❌ Backend path topilmadi");
    updateServerStatus("error", "Backend fayl topilmadi");
    return;
  }

  // Oldingi process ni to'xtatish
  if (backendProcess) {
    try {
      if (process.platform === "win32") {
        backendProcess.kill("SIGTERM");
      } else {
        backendProcess.kill("SIGTERM");
      }
      console.log("Oldingi process to'xtatildi");
    } catch (error) {
      console.log("Oldingi process to'xtatishda xatolik:", error.message);
    }
    backendProcess = null;
  }

  updateServerStatus("starting", "Server ishga tushmoqda...");

  backendProcess = spawn("node", [backendPath], {
    cwd: path.dirname(backendPath),
    shell: true,
    detached: false, // Windows da child process ni parent bilan bog'lash
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`Backend: ${data}`);
    const output = data.toString();
    if (
      output.includes("listening") ||
      output.includes("started") ||
      output.includes("Server")
    ) {
      setTimeout(async () => {
        const isRunning = await checkServerStatus();
        if (isRunning) {
          updateServerStatus("running", "Server muvaffaqiyatli ishga tushdi");
        }
      }, 1000);
    }
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`Backend error: ${data}`);
    updateServerStatus("error", `Xato: ${data.toString().slice(0, 100)}`);
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend tugadi, code: ${code}`);
    updateServerStatus("stopped", `Server to'xtadi (code: ${code})`);
    backendProcess = null;
  });

  backendProcess.on("error", (error) => {
    console.error(`Backend spawn error: ${error}`);
    updateServerStatus("error", `Ishga tushishda xatolik: ${error.message}`);
    backendProcess = null;
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`Backend exit: code=${code}, signal=${signal}`);
    if (!backendProcess) return; // Agar allaqachon null qilingan bo'lsa
    updateServerStatus("stopped", `Server to'xtadi (${signal || code})`);
    backendProcess = null;
  });
}

// IPC handlers
ipcMain.handle("select-backend", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "JavaScript files", extensions: ["js"] }],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    fs.writeFileSync(
      path.join(__dirname, ".env"),
      `BACKEND_PATH=${selectedPath}`
    );

    require("dotenv").config(); // qayta yuklash
    runBackend(selectedPath);

    return selectedPath;
  }

  return null;
});

ipcMain.handle("start-server", async () => {
  const backendPath = process.env.BACKEND_PATH;
  if (backendPath && fs.existsSync(backendPath)) {
    runBackend(backendPath);
    return { success: true };
  }
  return { success: false, error: "Backend fayl tanlanmagan" };
});

ipcMain.handle("stop-server", async () => {
  if (!backendProcess) {
    return { success: false, error: "Server ishlamayapti" };
  }

  return new Promise((resolve) => {
    try {
      console.log("Server to'xtatilmoqda...");
      updateServerStatus("stopping", "Server to'xtatilmoqda...");

      backendProcess.once("exit", async () => {
        console.log("Backend process to'xtadi");
        await killPortProcess(currentPort);
        console.log(`Port ${currentPort} bo'shatildi`);
        updateServerStatus("stopped", "Server muvaffaqiyatli to'xtatildi");
        backendProcess = null;
        resolve({ success: true });
      });

      if (process.platform === "win32") {
        backendProcess.kill("SIGTERM");
        setTimeout(() => {
          if (backendProcess && !backendProcess.killed) {
            backendProcess.kill("SIGKILL");
            console.log("Process majburan to'xtatildi");
          }
        }, 3000);
      } else {
        backendProcess.kill("SIGTERM");
      }
    } catch (error) {
      console.error("Server to'xtatishda xatolik:", error);
      updateServerStatus("error", `To'xtatishda xatolik: ${error.message}`);
      resolve({ success: false, error: error.message });
    }
  });
});

ipcMain.handle("get-server-status", async () => {
  let isActuallyRunning = false;
  if (serverStatus === "running") {
    isActuallyRunning = await checkServerStatus();
    if (!isActuallyRunning && backendProcess) {
      updateServerStatus("error", "Server javob bermayapti");
    }
  }
  return {
    status: serverStatus,
    isRunning: isActuallyRunning,
    backendPath: process.env.BACKEND_PATH || null,
  };
});

ipcMain.handle("check-server-health", async () => {
  const isRunning = await checkServerStatus();
  return { isRunning };
});

ipcMain.handle("get-active-ports", async () => {
  const ports = await getActivePorts();
  return { ports, currentPort };
});

ipcMain.handle("get-ports-with-processes", async () => {
  const portsInfo = await getPortsWithProcessInfo();
  return { portsInfo, currentPort };
});

ipcMain.handle("get-ports-with-process-info", async () => {
  try {
    const portsInfo = await getPortsWithProcessInfo();
    
    // Har bir port uchun qo'shimcha process ma'lumotlarini olish
    const enhancedPorts = [];
    
    for (const portInfo of portsInfo) {
      const enhancedPort = { ...portInfo };
      
      // Windows uchun process haqida batafsil ma'lumot olish
      if (process.platform === "win32" && portInfo.pid) {
        await new Promise((resolve) => {
          const { exec } = require("child_process");
          exec(`wmic process where "ProcessId=${portInfo.pid}" get Name,CommandLine,ExecutablePath /FORMAT:CSV`, 
            (error, stdout) => {
              if (!error && stdout) {
                const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
                if (lines.length > 0) {
                  const data = lines[0].split(',');
                  if (data.length >= 3) {
                    enhancedPort.command = data[1] || '';
                    enhancedPort.processPath = data[2] || '';
                    enhancedPort.processName = data[0] || enhancedPort.processName;
                  }
                }
              }
              resolve();
            });
        });
      }
      
      // Unix uchun ps command orqali ma'lumot olish
      else if (process.platform !== "win32" && portInfo.pid) {
        await new Promise((resolve) => {
          const { exec } = require("child_process");
          exec(`ps -p ${portInfo.pid} -o pid,comm,args --no-headers`, (error, stdout) => {
            if (!error && stdout) {
              const parts = stdout.trim().split(/\s+/);
              if (parts.length >= 3) {
                enhancedPort.processName = parts[1] || enhancedPort.processName;
                enhancedPort.command = parts.slice(2).join(' ') || '';
              }
            }
            resolve();
          });
        });
      }
      
      // State ma'lumotini qo'shish
      enhancedPort.state = 'LISTENING';
      
      enhancedPorts.push(enhancedPort);
    }
    
    return { 
      success: true, 
      ports: enhancedPorts.sort((a, b) => a.port - b.port),
      currentPort 
    };
  } catch (error) {
    console.error("Port process ma'lumotlarini olishda xatolik:", error);
    return { success: false, error: error.message, ports: [], currentPort };
  }
});

ipcMain.handle("set-port", async (event, port) => {
  const portNum = parseInt(port);
  if (portNum && portNum > 0 && portNum < 65536) {
    currentPort = portNum;

    // Port o'zgartirilganini .env fayliga saqlash
    const envPath = path.join(__dirname, ".env");
    let envContent = "";

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    // PORT qatorini yangilash yoki qo'shish
    const lines = envContent.split("\n");
    let portLineFound = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("PORT=")) {
        lines[i] = `PORT=${currentPort}`;
        portLineFound = true;
        break;
      }
    }

    if (!portLineFound) {
      lines.push(`PORT=${currentPort}`);
    }

    fs.writeFileSync(envPath, lines.join("\n"));
    require("dotenv").config(); // qayta yuklash

    return { success: true, port: currentPort };
  }
  return { success: false, error: "Yaroqsiz port raqami" };
});

ipcMain.handle("kill-port", async (event, port) => {
  const portNum = parseInt(port);
  if (portNum && portNum > 0 && portNum < 65536) {
    const success = await killPortProcess(portNum);
    return { success, port: portNum };
  }
  return { success: false, error: "Yaroqsiz port raqami" };
});

app.whenReady().then(() => {
  const backendPath = process.env.BACKEND_PATH;
  const envPort = process.env.PORT;

  // Port ni .env dan o'qish
  if (envPort) {
    const portNum = parseInt(envPort);
    if (portNum && portNum > 0 && portNum < 65536) {
      currentPort = portNum;
    }
  }

  createWindow();

  // 2 soniyadan keyin backend statusini tekshiramiz
  setTimeout(async () => {
    if (backendPath && fs.existsSync(backendPath)) {
      const isRunning = await checkServerStatus();
      if (isRunning) {
        updateServerStatus("running", "Server allaqachon ishlab turibdi");
      } else {
        updateServerStatus("stopped", "Server to'xtatilgan");
      }
    } else {
      updateServerStatus("stopped", "Backend fayl tanlanmagan");
    }
  }, 2000);
});

app.on("window-all-closed", () => {
  // Backend process ni to'xtatish
  if (backendProcess) {
    try {
      console.log("App yopilmoqda, backend to'xtatilmoqda...");
      if (process.platform === "win32") {
        backendProcess.kill("SIGTERM");
        // 2 soniyadan keyin majburan to'xtatish
        setTimeout(() => {
          if (backendProcess && !backendProcess.killed) {
            backendProcess.kill("SIGKILL");
          }
        }, 2000);
      } else {
        backendProcess.kill("SIGTERM");
      }
      backendProcess = null;
    } catch (error) {
      console.error("Backend to'xtatishda xatolik:", error);
    }
  }

  if (process.platform !== "darwin") app.quit();
});
