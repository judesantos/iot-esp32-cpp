/***************************************************************************************
 *
 * Based on ESP32_HTTPS_Server and WifiManager
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
#include <ArduinoJson.h>
#include <string>

#include "WebSocketService.h"

using namespace httpsserver;

void handleRoute(HTTPRequest *req, HTTPResponse *res);

#define DIR_PUBLIC ""
#define MAX_CLIENTS 4
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
 
HTTPSServer secureServer = HTTPSServer(&cert, 443, MAX_CLIENTS);
  
void configCb(WiFiManager *cfgMgr) {
  Serial.println("Entered config mode");
  Serial.println(WiFi.softAPIP());
  Serial.println(cfgMgr->getConfigPortalSSID());
}

void saveConfigCb() {
  Serial.println("Should save config");
  // shouldSaveConfig = true;
}

std::string topicGeneralPreProcessHandler(const std::string& msg) {
  Serial.println("topicGeneralPreProcessHandler() - received request");
  return msg;
}

void topicGeneralPostProcessHandler(const std::string& msg) {
  Serial.println("topicGeneralPostProcessHandler() - process request");
}

void setup() {
 
  Serial.begin(115200);
  
  Serial.println("Mounting SPIFFS...");
  if (!SPIFFS.begin(false)) {  
     Serial.println("SPIFFS mount failed. Exit!");  
     return; 
  }
  Serial.println("SPIFFS has been mounted.");

  // Now that SPIFFS is ready, we can create or load the certificate
  /*
  SSLCert *cert = getCertificate();
  if (cert == NULL) {
    Serial.println("Could not load certificate. Stop.");
    while(true);
  }
  */
  
  Serial.println("Connecting to wifi...");
  
  WiFiManager wifiManager;
  
  wifiManager.setAPCallback(configCb);
  wifiManager.setSaveConfigCallback(saveConfigCb);
  
  wifiManager.autoConnect("ytAP", "mangledc@bbag3069");
  
  Serial.println("Connected to wifi.");
  Serial.println("Setup async, secure web server...");

  xTaskCreatePinnedToCore(setupAsyncServer, "https443", 6144, NULL, 1, NULL, ARDUINO_RUNNING_CORE);  
}
 
void loop() {
  delay(10000);
}

void setupAsyncServer(void *params) {
  
  /* register routes */

  ResourceNode *rt404 = new ResourceNode("", "GET", handle404);
  ResourceNode *rtRoot = new ResourceNode("/", "GET", handleRoute);
  ResourceNode *rtJs = new ResourceNode("/main.js", "GET", handleRoute);
  ResourceNode *rtCss = new ResourceNode("/styles.css", "GET", handleRoute);
  secureServer.setDefaultNode(rt404);
  secureServer.registerNode(rtRoot);
  secureServer.registerNode(rtJs);
  secureServer.registerNode(rtCss);
  
  /* register websockets */
  
  const char *topic_general = "/";
  
  WebSocketNode *wsNode = new WebSocketNode(topic_general, &WebSocketHandler::create);
  // get reference to topic and setup application layer handlers 
  // used by all connections for this topic
  WebSocketTopic *tp = WebSocketManager::topic(topic_general);
  tp->registerPreProcessHandler(topicGeneralPreProcessHandler);
  tp->registerPostProcessHandler(topicGeneralPostProcessHandler);
  
  secureServer.registerNode(wsNode);

  // start server now!
  secureServer.start();
   
  if (secureServer.isRunning()) {
    Serial.println("Server ready.");
    while(true) {
      // This call will let the server do its work
      secureServer.loop();

      // Other code would go here...
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
}

void handleRoute(HTTPRequest * req, HTTPResponse * res) {  
  // We only handle GET here
  if (req->getMethod() == "GET") {
    // Redirect / to /index.html - default landing page
    std::string reqFile = req->getRequestString()=="/" || req->getRequestString()=="" ? 
      "/main.html" : req->getRequestString();

    // Try to open the file
    std::string filename = std::string(DIR_PUBLIC) + reqFile;
    Serial.println(String("loading file from SPIFFS:  ") + filename.c_str());
  
    // Check if the file exists
    if (!SPIFFS.exists(filename.c_str())) {
      return handle404(req, res);
    }
    
    Serial.println(String(filename.c_str()) + String(" loaded!"));

    File file = SPIFFS.open(filename.c_str());

    /* configure headers */
    
    // Set length
    res->setHeader("Content-Length", httpsserver::intToString(file.size()));
    // tell browser to cache files for 1 hour
    if (
      std::string::npos != reqFile.find(".js") || 
      std::string::npos != reqFile.find(".css") ||
      std::string::npos != reqFile.find(".html") ||
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
    Serial.println("No certificate found in SPIFFS, generating a new one for you.");
    Serial.println("If you face a Guru Meditation, give the script another try (or two...).");
    Serial.println("This may take up to a minute, so please stand by :)");

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
        Serial.println("Could not write /key.der");
        failure = true;
      }
      if (keyFile) keyFile.close();

      // Certificate
      certFile = SPIFFS.open("/cert.der", FILE_WRITE);
      if (!certFile || !certFile.write(newCert->getCertData(), newCert->getCertLength())) {
        Serial.println("Could not write /cert.der");
        failure = true;
      }
      if (certFile) certFile.close();

      if (failure) {
        Serial.println("Certificate could not be stored permanently, generating new certificate on reboot...");
      }
      return newCert;
    } else {
      // Certificate generation failed. Inform the user.
      Serial.println("An error occured during certificate generation.");
      Serial.print("Error code is 0x");
      Serial.println(res, HEX);
      Serial.println("You may have a look at SSLCert.h to find the reason for this error.");
      return NULL;
    }

  } else {
    Serial.println("Reading certificate from SPIFFS.");
    // The files exist, so we can create a certificate based on them
    size_t keySize = keyFile.size();
    size_t certSize = certFile.size();

    uint8_t * keyBuffer = new uint8_t[keySize];
    if (keyBuffer == NULL) {
      Serial.println("Not enough memory to load privat key");
      return NULL;
    }
    uint8_t * certBuffer = new uint8_t[certSize];
    if (certBuffer == NULL) {
      delete[] keyBuffer;
      Serial.println("Not enough memory to load certificate");
      return NULL;
    }
    keyFile.read(keyBuffer, keySize);
    certFile.read(certBuffer, certSize);

    // Close the files
    keyFile.close();
    certFile.close();
    Serial.printf("Read %u bytes of certificate and %u bytes of key from SPIFFS\n", certSize, keySize);
    return new SSLCert(certBuffer, certSize, keyBuffer, keySize);
  }
}
