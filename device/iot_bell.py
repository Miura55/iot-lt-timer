import ssl
import time

import machine
from machine import Pin
import network
import ntptime
import ubinascii
try:
    import ujson as json
except ImportError:
    import json
from umqtt.simple import MQTTClient
from device_config import (
    IOT_CORE_ENDPOINT,
    MQTT_TOPIC,
    RELAY_PULSE_MS,
    WIFI_PASSWORD,
    WIFI_SSID,
)

relay = Pin(15, Pin.OUT, value=0)

max_recent_commands = 128
recent_command_ids = []


def getClientID():
    mac = ubinascii.hexlify(network.WLAN().config("mac"), ":").decode()
    return "picoW_" + mac


def get_ssl_context():
    keyfile = "/certs/private.der"
    certfile = "/certs/certificate.der"
    cafile = "/certs/routeca.der"

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.verify_mode = ssl.CERT_REQUIRED
    context.load_verify_locations(cafile=cafile)
    context.load_cert_chain(certfile, keyfile)
    return context


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(False)
    time.sleep_ms(1000)
    wlan.active(True)
    time.sleep_ms(3000)
    retry = 10
    while retry > 0:
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        timeout = 10
        while not wlan.isconnected() and timeout > 0:
            time.sleep_ms(1000)
            print(".")
            timeout -= 1
        if not wlan.isconnected():
            print("not connected")
        if wlan.isconnected():
            print("connected")
            break
        retry -= 1
    if not wlan.isconnected():
        raise RuntimeError("Wi-Fi connection failed")


def remember_command(command_id):
    recent_command_ids.append(command_id)
    if len(recent_command_ids) > max_recent_commands:
        del recent_command_ids[0]


def play_command(message):
    command = json.loads(message)
    if command.get("schemaVersion") != 1:
        raise ValueError("Unsupported schemaVersion")

    command_id = command.get("commandId")
    ring_count = command.get("ringCount")
    interval_ms = command.get("intervalMs")
    scheduled_at_ms = command.get("scheduledAtMs")
    expires_at_ms = command.get("expiresAtMs")
    if not isinstance(command_id, str) or not command_id:
        raise ValueError("Missing commandId")
    if command_id in recent_command_ids:
        print("Duplicate command ignored")
        return
    if type(ring_count) is not int or ring_count not in (1, 2, 3):
        raise ValueError("Invalid ringCount")
    if type(interval_ms) is not int or interval_ms < RELAY_PULSE_MS:
        raise ValueError("Invalid intervalMs")
    if type(scheduled_at_ms) is not int or type(expires_at_ms) is not int:
        raise ValueError("Invalid command timestamps")
    if expires_at_ms <= scheduled_at_ms:
        raise ValueError("Invalid command expiry")

    now_ms = int(time.time() * 1000)
    if now_ms < scheduled_at_ms:
        wait_ms = scheduled_at_ms - now_ms
        if wait_ms >= expires_at_ms - scheduled_at_ms:
            print("Early command ignored")
            return
        time.sleep_ms(wait_ms)
        now_ms = int(time.time() * 1000)
    if now_ms >= expires_at_ms:
        print("Expired command ignored")
        return

    print("Command accepted:", command_id, "rings:", ring_count)
    remember_command(command_id)
    try:
        for index in range(ring_count):
            print("Ring", index + 1, "of", ring_count)
            # Transistor ON pulls the bell's T terminal LOW.
            relay.value(1)
            time.sleep_ms(RELAY_PULSE_MS)
            relay.value(0)
            if index < ring_count - 1:
                # intervalMs is the start-to-start interval between rings.
                time.sleep_ms(interval_ms - RELAY_PULSE_MS)
    finally:
        relay.value(0)


# MQTTメッセージをsubscribe
def subscribe_message(client):
    def on_message(topic, message):
        print("MQTT message received on", topic)
        try:
            play_command(message)
        except Exception as error:
            relay.value(0)
            print("Bell command rejected:", error)

    client.set_callback(on_message)
    client.subscribe(MQTT_TOPIC)
    print(f"Subscribed to {MQTT_TOPIC}")
    while True:
        try:
            client.wait_msg()
        except Exception as e:
            client.disconnect()
            print("MQTT Disconnected")
            break


if __name__ == "__main__":
    # initialize
    led = machine.Pin("LED", machine.Pin.OUT)
    led.off()

    while True:
        mqtt = None
        try:
            connect_wifi()
            ntptime.settime()
            ssl_context = get_ssl_context()
            mqtt_client_id = getClientID()
            mqtt = MQTTClient(
                mqtt_client_id,
                IOT_CORE_ENDPOINT,
                port=8883,
                keepalive=60,
                ssl=ssl_context,
            )
            mqtt.connect()
            led.on()
            subscribe_message(mqtt)
        except Exception as error:
            print("Bell connection failed:", error)
        finally:
            if mqtt:
                try:
                    mqtt.disconnect()
                except Exception:
                    pass
            relay.value(0)
            led.off()
            time.sleep(5)
