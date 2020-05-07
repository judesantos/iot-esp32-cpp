#ifndef _yt_device_H_
#define _yt_device_H_

#include <ArduinoJson.h>

#define DOC_SIZE (JSON_OBJECT_SIZE(4) + 180)

namespace YT {

  class Device {
  public:
    std::string name;

    Device(const char* _name):name(_name) {}
    ~Device() {}

    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) = 0;

    static const int16_t STATUS_SUCCESS = 0;
    static const int16_t STATUS_ERROR = -10000;
    static const int16_t INVALID_REQUEST_PROPERTY_NOT_FOUND = -1;
    static const int16_t INVALID_COMMAND = -2;
    static const int16_t INVALID_REQUEST = -3;
    static const int16_t INVALID_NOT_SUPPORTED = -4;
  };

}

#endif // _yt_device_H_