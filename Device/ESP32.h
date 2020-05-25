#ifndef _yt_esp32_H_
#define _yt_esp32_H_

#include <tcpip_adapter.h>

#ifdef __cplusplus
  extern "C" {
#endif
  uint8_t temprature_sens_read();
#ifdef __cplusplus
  }
#endif

uint8_t temprature_sens_read();

namespace YT {

  /**
   * class ESP32MC
   *
   * Handle internal device information:
   *  - hall (magnetic proximity detector)
   *  - internal device temperature in F and C
   *  - flash memory, heap, cpu, etc.
   */
  class ESP32MC : public Device {
  public:
    ESP32MC(): Device("esp32") {}
    virtual ~ESP32MC() {};

    // device core temp in degrees Fahrenheit
    int32_t temperatureF() {
      return temprature_sens_read();
    }

    // device core temp in degrees Centigrade
    int32_t temperatureC() {
      return (temprature_sens_read() - 32) / 1.8;
    }

    // internal device hall sensor
    // returns relative proximity value
    // magnetic field orientation also affects value.
    double hall() {
      // get average rate
      // sampling rate @ 100 per millisecond
      long h = 0;
      for (int i=0; i<1000;i++) {
        h += hallRead();
        delayMicroseconds(100);
      }
      return (double)h/1000;
    }

    std::string macAddress() {
      uint8_t ui8Mac[6];
      char achMac[18] = {0};
      esp_read_mac(ui8Mac, ESP_MAC_WIFI_STA);
      sprintf(achMac, "%02X:%02X:%02X:%02X:%02X:%02X", 
        ui8Mac[0], ui8Mac[1], ui8Mac[2], ui8Mac[3], ui8Mac[4], ui8Mac[5]);
      return std::string(achMac);
    }

    std::string ipAddress() {
      tcpip_adapter_ip_info_t ipInfo; 
      char achIP[32] = {0};
      tcpip_adapter_get_ip_info(TCPIP_ADAPTER_IF_STA, &ipInfo);
      sprintf(achIP, "%s", ip4addr_ntoa(&ipInfo.ip));
      return std::string(achIP);
    }

    // get device info
    virtual int16_t getInfo(JsonObject& jsonRes) {
      // core info
      jsonRes["response"]["mac"] = macAddress();
      jsonRes["response"]["ip"] = ipAddress();
      jsonRes["response"]["chip_revision"] = ESP.getChipRevision();
      jsonRes["response"]["chip_freq_mhz"] = ESP.getCpuFreqMHz();
      jsonRes["response"]["sdk_version"] = ESP.getSdkVersion();
      jsonRes["response"]["heap_size"] = ESP.getHeapSize();
      
      // get flash chip info
      jsonRes["response"]["flash_size"] = ESP.getFlashChipSize() / 1000000;
      jsonRes["response"]["flash_speed_mbps"] = ESP.getFlashChipSpeed() / 1000000;
      jsonRes["response"]["flash_mode"] = ESP.getFlashChipMode();
      return Device::STATUS_SUCCESS;
    }

    virtual int16_t getStatus(JsonObject& jsonRes) {
      // get core status
      jsonRes["response"]["free_heap"] = ESP.getFreeHeap();
      jsonRes["response"]["chip_cycle_count"] = ESP.getCycleCount();
      jsonRes["response"]["temp_c"] = temperatureC();
      jsonRes["response"]["temp_f"] = temperatureF();
      jsonRes["response"]["hall"] = hall();
      jsonRes["request"]["property"] = "esp32";
      return Device::STATUS_SUCCESS;
    }

    // handle request 
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_SUCCESS;
      auto type = jsonReq["type"];
      auto prop = jsonReq["property"];

      DEBUG_F("GPIO::handleCommand() - property: %s, type:%s\n", 
        (const char*) prop, (const char*) type);
      
      if (NULL != type && 0 == strcmp(type, "all")) {
        this->getInfo(jsonRes);
        this->getStatus(jsonRes);
        jsonRes["request"] = jsonReq;
      } else {
        DEBUG_PL("ESP32::handleCommand() - Error: command not found");
        error = INVALID_REQUEST_PROPERTY_NOT_FOUND;
      }
      return error;
    }

  };

}

#endif // _yt_esp32_H_