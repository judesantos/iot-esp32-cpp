#ifndef _yt_common_H_
#define _yt_common_H_

#define DEBUG 1
#if DEBUG
  #define DEBUG_BEGIN Serial.begin
  #define DEBUG_P Serial.print
  #define DEBUG_PL Serial.println
  #define DEBUG_F Serial.printf
#else
  #define DEBUG_BEGIN(x) {}
  #define DEBUG_P(x) {}
  #define DEBUG_PL(...) {}
  #define DEBUG_F(...) {}
#endif


#endif // _yt_common_H_