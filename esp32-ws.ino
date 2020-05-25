/***************************************************************************************
 *
 * Based on ESP32_HTTPS_Server v1.0.0 and WifiManager
 *  Developed/tested in heltec esp32 8mb hardware & Arduino IDE
 * 
 * Features:
 *  - Autoconnect AP/config 
 *  - secure/asynchronous web server
 *  - secure/asynchronous web socket
 *  - Device Manager web application (supports: GPIO, Heat, GPS - extendable)
 *
 * Others:
 *  - auto cache resource files for (1 hour - configure as needed)
 *  - default self-signed certificate (do not use in production)
 *  - load certificate from SPIFFS (flash memory)
 *  - load resources from SPIFFS - "/data"
 *
 *
 **************************************************************************************/
#include "cert.h"
#include "private_key.h"

#include <WiFi.h>
#include <WiFiManager.h>

#include <HTTPSServer.hpp>
#include <SSLCert.hpp>
#include <HTTPRequest.hpp>
#include <HTTPResponse.hpp>
#include <util.hpp>

#include <SPIFFS.h>
#include <FS.h>
#include <string>

#include "WebSocketService.h"
#include "Device/DeviceManager.h"

using namespace httpsserver;

void handleRoute(HTTPRequest *req, HTTPResponse *res);

#define DIR_PUBLIC ""
#define MAX_CLIENTS 4
#define INTERNAL_AP_SSID "ytAP"
#define INTERNAL_AP_PW "mangledc@bbag3069"
/** Check if we have multiple cores */
#if CONFIG_FREERTOS_UNICORE
  #define ARDUINO_RUNNING_CORE 0
#else
  #define ARDUINO_RUNNING_CORE 1
#endif

const char contentTypes[][2][32] = {
  {".html", "text/html"},
  {".css",  "text/css"},
  {".js",   "application/javascript"},
  {".json", "application/json"},
  {".png",  "image/png"},
  {".jpg",  "image/jpg"},
  {"", ""}
};

SSLCert cert = SSLCert(
  example_crt_DER, example_crt_DER_len,
  example_key_DER, example_key_DER_len
);
 
YT::DeviceManager deviceManager;
HTTPSServer secureServer = HTTPSServer(&cert, 443, MAX_CLIENTS);

// push notifier handle - broadcast updates for each topic.
WebSocketTopic *g_tp_esp32 = nullptr;

// AP Configuration

void configCb(WiFiManager *cfgMgr) {
  DEBUG_PL("Entered config mode");
  DEBUG_PL(WiFi.softAPIP());
  DEBUG_PL(cfgMgr->getConfigPortalSSID());
}

void saveConfigCb() {
  DEBUG_PL("Should save config");
  // shouldSaveConfig = true;
}

/*******************************************************************
 * uPC routines setup() and loop()
 ******************************************************************/

void setup() {

  DEBUG_BEGIN(115200);
  DEBUG_PL("Mounting SPIFFS...");

  if (!SPIFFS.begin(true)) {  
     DEBUG_PL("SPIFFS mount failed. Exit!");  
     return; 
  }

  DEBUG_PL("SPIFFS has been mounted.");

  // load certificate - replace default (self-signed) test certificate 
  /*
  SSLCert *cert = getCertificate();
  if (cert == NULL) {
    DEBUG_PL("Could not load certificate. Stop.");
    while(true);
  }
  */

  /* 
    Configure wifi. 
    To connect to a nearby AP(wifi) - with internet connection, 
    we need to provide valid access for ESP32. For first time access, 
    setup ourself as AP - 'ytAP', to scan and list nearby APs. 
    Connect to 'ytAP' from a mobile device or pc.
    Once connected to 'ytAP', a user interface is autoloaded with a list of SSIDs, 
    select target SSID and provide password. Once access is granted, 
    'ytAP' will automatically shutdown and reconnect to the new AP.
  */
  WiFi.mode(WIFI_STA); // defaults to client mode
  WiFiManager wifiManager;

  DEBUG_PL("Connecting to wifi...");

  wifiManager.setAPCallback(configCb);
  wifiManager.setSaveConfigCallback(saveConfigCb);
  wifiManager.autoConnect(INTERNAL_AP_SSID, INTERNAL_AP_PW);

  DEBUG_PL("Connected to wifi.");
  DEBUG_PL("Setup web server...");

  // accept requests from another thread - asynchrnous webserver connections
  xTaskCreatePinnedToCore(setupAsyncServer, "https443", 6144*2, NULL, 1, NULL, ARDUINO_RUNNING_CORE);  
}
 
// do hardware monitoring stuff here,,,
void loop() {

  // send back esp32mc information to ws subscribers
  if (g_tp_esp32 && 0 < g_tp_esp32->numSubscribers()) {
    std::string msg;
    int16_t error = deviceManager.getUpdates("esp32", msg);
    if (!error) {
      g_tp_esp32->sendToAllClients(msg);
    }
  }

  delay(3000); // update every 5s
}

/*******************************************************************
 * Application services 
 ******************************************************************/

void topicGeneralPreProcessHandler(const std::string& msg) {
  DEBUG_PL("topicGeneralPreProcessHandler() - received request");
}

void topicGeneralPostProcessHandler(std::string& msg) {
  DEBUG_PL("topicGeneralPostProcessHandler() - process request");
}

std::string preProcessHandler(const std::string& msg) {
  DEBUG_PL("socketPreProcessHandler() - received request");
  topicGeneralPreProcessHandler(msg);
  return deviceManager.processRequest(msg);
}

void postProcessHandler(std::string& msg) {
  DEBUG_PL("socketPostProcessHandler() - process request");
  topicGeneralPostProcessHandler(msg);
}

void setupAsyncServer(void *params) {
  
  /* register routes */

  ResourceNode *rt404 = new ResourceNode("", "GET", handle404);
  secureServer.setDefaultNode(rt404);
  ResourceNode *rtRoot = new ResourceNode("/", "GET", handleRoute); // defaults to main.html
  secureServer.registerNode(rtRoot);
  ResourceNode *rtEsp32 = new ResourceNode("/esp32", "GET", handleRoute);
  secureServer.registerNode(rtEsp32);
  ResourceNode *rtJs = new ResourceNode("/main.js", "GET", handleRoute);
  secureServer.registerNode(rtJs);
  ResourceNode *rtImg = new ResourceNode("/esp32.jpg", "GET", handleRoute);
  secureServer.registerNode(rtImg);
  ResourceNode *rtReset = new ResourceNode("/config", "GET", handleReset);
  secureServer.registerNode(rtReset);
  
  /* register websockets */

  const char *topic_gpio = "/gpio";
  const char *topic_gps = "/gps";
  const char *topic_esp32 = "/esp32";
  const char *topic_thermistor = "/thermistor";
  const char *topic_proximity = "/proximity";
  // create topic and setup application layer handlers 
  // - used by all connections for this topic
  WebSocketTopic *tp = WebSocketManager::topic(topic_gpio);
  if (tp) {
    tp->registerPreProcessHandler(&preProcessHandler);
    tp->registerPostProcessHandler(&postProcessHandler);
  }
  // register now!
  WebSocketNode *wsNode = new WebSocketNode(topic_gpio, &WebSocketHandler::create);
  secureServer.registerNode(wsNode);

  // do the same routine for the rest of the topics

  tp = g_tp_esp32 = WebSocketManager::topic(topic_esp32);
  if (tp) {
    tp->registerPreProcessHandler(&preProcessHandler);
    tp->registerPostProcessHandler(&postProcessHandler);
  }
  wsNode = new WebSocketNode(topic_esp32, &WebSocketHandler::create);
  secureServer.registerNode(wsNode);

  tp = WebSocketManager::topic(topic_gps);
  if (tp) {
    tp->registerPreProcessHandler(&preProcessHandler);
    tp->registerPostProcessHandler(&postProcessHandler);
  }
  wsNode = new WebSocketNode(topic_gps, &WebSocketHandler::create);
  secureServer.registerNode(wsNode);

  tp = WebSocketManager::topic(topic_thermistor);
  if (tp) {
    tp->registerPreProcessHandler(&preProcessHandler);
    tp->registerPostProcessHandler(&postProcessHandler);
  }
  wsNode = new WebSocketNode(topic_thermistor, &WebSocketHandler::create);
  secureServer.registerNode(wsNode);

  tp = WebSocketManager::topic(topic_proximity);
  if (tp) {
    tp->registerPreProcessHandler(&preProcessHandler);
    tp->registerPostProcessHandler(&postProcessHandler);
  }
  wsNode = new WebSocketNode(topic_proximity, &WebSocketHandler::create);
  secureServer.registerNode(wsNode);

  // start server now!
  secureServer.start();
   
  if (secureServer.isRunning()) {
    DEBUG_PL("Server ready.");
    while(true) {
      secureServer.loop();
      delay(1);
    }
  }  
}

void handle404(HTTPRequest * req, HTTPResponse * res) {
  req->discardRequestBody();
  res->setStatusCode(404);
  res->setStatusText("Not Found");
  res->setHeader("Content-Type", "text/html");
  res->println("<!DOCTYPE html>");
  res->println("<html>");
  res->println("<head><title>Not Found</title></head>");
  res->println("<body><center><h1>404 Not Found</h1><p>The requested resource was not found on this server.</p></center></body>");
  res->println("</html>");
  res->finalize();
}

void handle405(HTTPRequest * req, HTTPResponse * res) {
  req->discardRequestBody();
  res->setStatusCode(405);
  res->setStatusText("Not Allowed");
  res->setHeader("Content-Type", "text/html");
  res->println("<!DOCTYPE html>");
  res->println("<html>");
  res->println("<head><title>Method Not Allowed</title></head>");
  res->println("<body><center><h1>405 Not Found</h1><p>The requested method is restricted on this server.</p></center></body>");
  res->println("</html>");
  res->finalize();
}

/**
 * Delete previously configure SSID/PW, restart ESP32 to serve as local AP 'ytAP'.
 */
void handleReset(HTTPRequest * req, HTTPResponse * res) {
  req->discardRequestBody();
  res->setStatusCode(200);
  res->setStatusText("Success");
  res->setHeader("Content-Type", "text/html");
  res->println("<!DOCTYPE html>");
  res->println("<html>");
  res->println("<head><title>Configure ESP32</title></head>");
  res->println("<body><center><h1>Reset ESP32 Success!</h1><p><h3>" \
    "To enter config mode and connect to a new wifi station, " \
    "go to device wifi settings and search for 'ytAP'.<br>" \
    "The Configure AP window should load immediately after connecting to 'ytAP'.<br>" \
    "Select your preferred wifi station to join ESP32.</h3>" \
    "Password may be required.</center></body>");
  res->println("</html>");
  res->finalize(); // send now!
  delay(1000);
  // Erase STA config 
  WiFiManager wifiManager;
  wifiManager.resetSettings();
  // teardown current configured STA and load wifi in AP Mode using SSID 'ytAP'
  wifiManager.autoConnect(INTERNAL_AP_SSID, INTERNAL_AP_PW);
  //ESP.restart(); // 
}

void handleRoute(HTTPRequest * req, HTTPResponse * res) {  
  // We only handle GET here
  if (req->getMethod() == "GET") {
    // Redirect / to /index.html - default landing page
    std::string reqFile = req->getRequestString()=="/" || req->getRequestString()=="" ? 
      "/main.html" : req->getRequestString();

    // Try to open the file
    std::string filename = std::string(DIR_PUBLIC) + reqFile;
    DEBUG_PL(String("loading file from SPIFFS:  ") + filename.c_str());
  
    // Check if the file exists
    if (!SPIFFS.exists(filename.c_str())) {
      return handle404(req, res);
    }
    
    DEBUG_PL(String(filename.c_str()) + String(" loaded!"));

    File file = SPIFFS.open(filename.c_str());

    /* configure headers */
    
    // Set length
    res->setHeader("Content-Length", httpsserver::intToString(file.size()));
    // tell browser to cache files for 1 hour
    if (
      std::string::npos != reqFile.find(".js") || 
      std::string::npos != reqFile.find(".css") ||
      std::string::npos != reqFile.find(".jpg") ||
      std::string::npos != reqFile.find(".png")
    ) {
      res->setHeader("Cache-Control", "max-age=3600");
    }

    // Content-Type is guessed using the definition of the contentTypes-table defined above
    int cTypeIdx = 0;
    do {
      if(reqFile.rfind(contentTypes[cTypeIdx][0])!=std::string::npos) {
        res->setHeader("Content-Type", contentTypes[cTypeIdx][1]);
        break;
      }
      cTypeIdx+=1;
    } while(strlen(contentTypes[cTypeIdx][0])>0);

    // Read the file and write it to the response
    uint8_t buffer[256];
    size_t length = 0;
    do {
      length = file.read(buffer, 256);
      res->write(buffer, length);
    } while (length > 0);

    file.close();
  } else {
     return handle405(req, res);
  }
}

SSLCert * getCertificate() {
  // Try to open key and cert file to see if they exist
  File keyFile = SPIFFS.open("/key.der");
  File certFile = SPIFFS.open("/cert.der");

  // If now, create them 
  if (!keyFile || !certFile || keyFile.size()==0 || certFile.size()==0) {
    DEBUG_PL("No certificate found in SPIFFS, generating a new one for you.");
    DEBUG_PL("If you face a Guru Meditation, give the script another try (or two...).");
    DEBUG_PL("This may take up to a minute, so please stand by :)");

    SSLCert * newCert = new SSLCert();
    // The part after the CN= is the domain that this certificate will match, in this
    // case, it's esp32.local.
    // However, as the certificate is self-signed, your browser won't trust the server
    // anyway.
    int res = createSelfSignedCert(*newCert, KEYSIZE_1024, "CN=esp32.local,O=acme,C=DE");
    if (res == 0) {
      // We now have a certificate. We store it on the SPIFFS to restore it on next boot.

      bool failure = false;
      // Private key
      keyFile = SPIFFS.open("/key.der", FILE_WRITE);
      if (!keyFile || !keyFile.write(newCert->getPKData(), newCert->getPKLength())) {
        DEBUG_PL("Could not write /key.der");
        failure = true;
      }
      if (keyFile) keyFile.close();

      // Certificate
      certFile = SPIFFS.open("/cert.der", FILE_WRITE);
      if (!certFile || !certFile.write(newCert->getCertData(), newCert->getCertLength())) {
        DEBUG_PL("Could not write /cert.der");
        failure = true;
      }
      if (certFile) certFile.close();

      if (failure) {
        DEBUG_PL("Certificate could not be stored permanently, generating new certificate on reboot...");
      }
      return newCert;
    } else {
      // Certificate generation failed. Inform the user.
      DEBUG_PL("An error occured during certificate generation.");
      DEBUG_P("Error code is 0x");
      DEBUG_PL(res, HEX);
      DEBUG_PL("You may have a look at SSLCert.h to find the reason for this error.");
      return NULL;
    }

  } else {
    DEBUG_PL("Reading certificate from SPIFFS.");
    // The files exist, so we can create a certificate based on them
    size_t keySize = keyFile.size();
    size_t certSize = certFile.size();

    uint8_t * keyBuffer = new uint8_t[keySize];
    if (keyBuffer == NULL) {
      DEBUG_PL("Not enough memory to load privat key");
      return NULL;
    }
    uint8_t * certBuffer = new uint8_t[certSize];
    if (certBuffer == NULL) {
      delete[] keyBuffer;
      DEBUG_PL("Not enough memory to load certificate");
      return NULL;
    }
    keyFile.read(keyBuffer, keySize);
    certFile.read(certBuffer, certSize);

    // Close the files
    keyFile.close();
    certFile.close();
    DEBUG_F("Read %u bytes of certificate and %u bytes of key from SPIFFS\n", certSize, keySize);
    return new SSLCert(certBuffer, certSize, keyBuffer, keySize);
  }

}
