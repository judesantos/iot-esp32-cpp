#ifndef _yt_thermistor_H_
#define _yt_thermistor_H_

#include "Device.h"

namespace YT {

  class Thermistor : public Device {
  public:
    Thermistor():Device("thermistor") {}
    virtual ~Thermistor() {} 
    /**
    * Implements Abstract method Device::handleCommand()
    */
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_ERROR;
      return error;
    }

  };

}

#endif // _yt_thermistor_H_