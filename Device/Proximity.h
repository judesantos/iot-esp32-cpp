#ifndef _yt_proximity_H_
#define _yt_proximity_H_

#include "Device.h"

namespace YT {

  class Proximity : public Device {
  public:
    Proximity():Device("proximity") {}
    virtual ~Proximity() {} 
    /**
    * Implements Abstract method Device::handleCommand()
    */
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      int16_t error = STATUS_ERROR;
      return error;
    }

  };

}

#endif // _yt_proximity_H_