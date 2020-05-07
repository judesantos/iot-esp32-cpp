#ifndef _yt_gps_H_
#define _yt_gps_H_

#include "Device.h"


namespace YT {

  class GPS : public Device {
  public:
    GPS():Device("gps") {}
    virtual ~GPS() {} 
    /**
    * Implements Abstract method Device::handleCommand()
    */
    virtual int16_t handleCommand(const JsonObject& jsonReq, JsonObject& jsonRes) {
      uint16_t error = STATUS_ERROR;
      return error;
    }

  };

}

#endif // _yt_gps_H_