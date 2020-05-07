#ifndef _yt_device_manager_H_
#define _yt_device_manager_H_

#include "GPIO.h"
#include "GPS.h"
#include "Thermistor.h"
#include "Proximity.h"

#define MAX_DEVICES 100

namespace YT {

  class DeviceManager {
  private:
    Device *m_devices[MAX_DEVICES] = {0};
    Device* createDeviceAbstractionObject(const char* name) {
      Device *d = nullptr;
      if (0 == strcmp(name, "gpio")) {
          d = new GPIO();
      } else if (0 == strcmp(name, "gps")) {
          d = new GPS();
      } else if (0 == strcmp(name, "proximity")) {
          d = new Proximity();
      } else if (0 == strcmp(name, "thermistor")) {
          d = new Thermistor();
      }
      Serial.printf("createDeviceAbstractionObject - Created device instance '%s:%d'\n", name, d);
      return d;
    }
    // get device instance from list. If not found, create.
    Device* getDevice(const char* name) {
      Device *d = nullptr;
      for (int idx = 0; idx < MAX_DEVICES; idx++) {
        if (nullptr != this->m_devices[idx] && name == this->m_devices[idx]->name) {
          d = this->m_devices[idx];
          break;
        }
      }
      Serial.printf("DeviceManager::getDevice() - '%s:%d'\n", name, d);
      if (nullptr == d) {
        for (int idx = 0; idx < MAX_DEVICES; idx++) {
          if (nullptr == this->m_devices[idx]) {
            d = this->m_devices[idx] = this->createDeviceAbstractionObject(name);
            break;
          }
        }
      }
      return d;
    }
  public:
    virtual ~DeviceManager()  {
      for (int idx = 0; idx < MAX_DEVICES; idx++) {
        if (nullptr != this->m_devices[idx]) {
          delete this->m_devices[idx];
        }
      }
    }
    /**
    * DeviceManager::processRequest()
    * Entry point for all hardware requests.
    * @param msg - json formatted string request
    * @return json formatted string response
    */
    std::string processRequest(const std::string& msg) {
      Serial.println("Enter DeviceManager::processRequest()");
      std::string strRes;
      // jsonstring to jsonobject
      StaticJsonDocument<DOC_SIZE> docReq;
      auto error = deserializeJson(docReq, msg);
      if (error) {
        Serial.print("deserializeJson() failed: ");
        Serial.println(error.c_str());
        return this->jsonResponse(msg, Device::INVALID_REQUEST, error.c_str());
      }
      JsonObject req = docReq.as<JsonObject>(); // cast
      const char *prop = req["property"];
      // process jsonobj
      if (prop) {
        Device *d = this->getDevice(prop);
        if (d) {
          // creat json response object
          StaticJsonDocument<DOC_SIZE> docRes;
          JsonObject res = docRes.to<JsonObject>(); // initialize
          // process response
          int16_t status = d->handleCommand(req, res);
          if (Device::STATUS_SUCCESS == status) {
            strRes = this->jsonResponse(res);
          } else {
            strRes = this->jsonResponse(msg, status, "request failed");
          }
        } else {
          strRes = this->jsonResponse(msg, Device::INVALID_NOT_SUPPORTED,
            "device type not supported");
        }
      } else {
        strRes = this->jsonResponse(msg, Device::INVALID_REQUEST_PROPERTY_NOT_FOUND,
          "no device type specified");
      }
      Serial.printf("RESPONSE: %s\n", strRes.c_str());
      Serial.println("Exit DeviceManager::processRequest()");
      // return response as jsonString
      return strRes;
    }

    /**
    * Create json format string response
    */
    std::string jsonResponse(JsonObject& json, int16_t status=0, const char* error="success")
    { 
      // creat json response object
      StaticJsonDocument<DOC_SIZE> doc;
      JsonObject res = doc.to<JsonObject>();
      // set json values
      res["status"] = status;
      res["message"] = error;
      res["data"] = json;
      // stringify
      std::string strRes;
      serializeJson(doc, strRes);

      return strRes;
    }

    std::string jsonResponse(const std::string& msg, int16_t status=0, const char* error="success")
    { 
      // creat json response object
      StaticJsonDocument<DOC_SIZE> doc;
      JsonObject res = doc.to<JsonObject>();
      // set json values
      res["status"] = status;
      res["message"] = error;
      res["data"] = msg;
      // stringify
      std::string strRes;
      serializeJson(doc, strRes);

      return strRes;
    }

  };

}

#endif //_yt_device_manager_H_