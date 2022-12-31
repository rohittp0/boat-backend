const temperatureData = []

const chart = new CanvasJS.Chart("temperatureChart", {
    title: {
        text: "Temperature"
    },
    data: [{
        type: "line",
        dataPoints: temperatureData
    }]
});

const clientType = location.hash?.replace("#", "") || 'viewer';
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${protocol}://${location.host}/ws?client=${clientType}&&key=boat`;
const ws = new WebSocket(wsUrl);

let deviceOnline = false;
let lastKey = null;
let lastOn = null;

function updateTemperatureData(temp) {
    temperatureData.push({x: temperatureData.length, y: temp});
    chart.options.data[0].dataPoints = temperatureData;
    chart.render();
}

ws.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.type === 'data')
        updateTemperatureData(parseFloat(data.data) ?? -127);
    else if (data.type === 'error')
        console.error(data.message);
    else if (data.type === 'connection') {
        if (data.status === 'connected')
            ws.send(JSON.stringify({type: "info"}));
        else
            console.error("Unable to connect");
    }
    else if (data.type === 'device')
        setDeviceState(data.status);
}

ws.onclose = () => location.reload();

const keys = ["Up", "Down", "Left", "Right"];

function sendKey(key, on) {
    if(!deviceOnline)
        return;

    if (lastKey === key && lastOn === on)
        return;

    lastKey = key;
    lastOn = on;

    ws.send(JSON.stringify({type: "command", data: {key, on}}));
}

function setDeviceState(state) {
    deviceOnline = state === "connected";

    document.getElementById("temperatureChart").hidden = !deviceOnline;
    document.getElementById("keys").hidden = !deviceOnline;
    document.getElementById("noDevice").hidden = deviceOnline;
}

keys.forEach(key => {
    key = key.toLowerCase();
    const button = document.getElementsByClassName(key)[0];

    button.addEventListener("mousedown", () => sendKey(key, true), {passive: true});
    button.addEventListener("mouseup", () => sendKey(key, false), {passive: true});
});

document.addEventListener("keydown", (event) => {
    const key = keys.find(k => event.key.endsWith(k));
    if (key)
        sendKey(key.toLowerCase(), true);
},
    {passive: true});

document.addEventListener("keyup", (event) => {
    const key = keys.find(k => event.key.endsWith(k));
    if (key)
        sendKey(key.toLowerCase(), false);
},
    {passive: true});


if(clientType === "admin")
    document.getElementById("admin").hidden = false;
else if(clientType === "viewer")
    document.getElementById("viewer").hidden = false;

setDeviceState("disconnected");
