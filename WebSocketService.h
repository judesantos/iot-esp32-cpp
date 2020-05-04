/***************************************************************************************
 *
 * Based on ESP32_HTTPS_Server HTTPSServer
 *  Developed/tested in heltec esp32 8mb hardware & Arduino IDE
 * 
 * Web Socket service classes
 * 
 *  - Manage connection lifecycle
 *  - Publish/Subscribe 
 *  - Manage connections by topic 
 *
 *
 **************************************************************************************/
#ifndef _yt_web_socket_service_H_
#define _yt_web_socket_service_H_

#include <WebsocketHandler.hpp>

using namespace httpsserver;

#define MAX_TOPICS 100
#define MAX_TOPIC_SUBSCRIBERS 100

typedef std::string (*fnHdlPreCb)(const std::string& msg);
typedef void (*fnHdlPostCb)(const std::string& msg);

class WebSocketTopic;
class WebSocketManager;

/**
 * class WebSocketHandler
 */
class WebSocketHandler : public WebsocketHandler {
private: 
  static WebSocketManager m_wsManager;
  WebSocketTopic *m_parent;
public:
  WebSocketHandler(WebSocketTopic *parent) {
    this->m_parent = parent;
  }
    
  void onClose();
  void onMessage(WebsocketInputStreambuf *stream); 
  
  static WebSocketHandler* create(const std::string& _topic);
};

/**
 * class WebSocketTopic
 */
class WebSocketTopic {
private:
  WebSocketHandler *m_wsHandlers[MAX_TOPIC_SUBSCRIBERS] = {0};
public:
  fnHdlPreCb m_hdlPreCb = nullptr;
  fnHdlPostCb m_hdlPostCb = nullptr;
  std::string name; // topic name

  WebSocketTopic(const char *topic) {
    this->name = topic;
  }

  void registerPreProcessHandler(fnHdlPreCb cb) {
    this->m_hdlPreCb = cb;
  }

  void registerPostProcessHandler(fnHdlPostCb cb) {
    this->m_hdlPostCb = cb;
  }

  void sendToAllClients(std::string &msg) {
    for(int idx = 0; idx < MAX_TOPIC_SUBSCRIBERS; idx++) {
      if (nullptr != this->m_wsHandlers[idx]) {
        this->m_wsHandlers[idx]->send(msg, WebsocketHandler::SEND_TYPE_TEXT);
      }
    }
  }

  void removeHandler(WebSocketHandler *hdl) {
    for (int idx = 0; idx < MAX_TOPIC_SUBSCRIBERS; idx++) {
      if (hdl == this->m_wsHandlers[idx]) {
        this->m_wsHandlers[idx] = nullptr;
      }
    }
  }

  WebSocketHandler* subscribe() {
    WebSocketHandler *handler = nullptr;
    for (int idx = 0; idx < MAX_TOPIC_SUBSCRIBERS; idx++) {
      if (nullptr == this->m_wsHandlers[idx]) {
        handler = new WebSocketHandler(this);
        this->m_wsHandlers[idx] = handler;
        break;
      }
    }
    assert(handler != nullptr);
    return handler;
  }
};

/**
 * class WebSocketManager
 */
class WebSocketManager {
private:
  static WebSocketTopic *m_wsTopics[MAX_TOPICS];
public:
  static WebSocketTopic* topic(const char* topic) {
    WebSocketTopic *wsTopic = nullptr;
    for (int idx = 0; idx < MAX_TOPICS; idx++) {
      // check if exists
      if (
        nullptr != WebSocketManager::m_wsTopics[idx] && 
        topic == WebSocketManager::m_wsTopics[idx]->name.c_str()
      ) {
        wsTopic = WebSocketManager::m_wsTopics[idx];
        break;
      }
    }
    //create topic if not exists
    if (wsTopic == nullptr) {
      for (int idx = 0; idx < MAX_TOPICS; idx++) {
        if (WebSocketManager::m_wsTopics[idx] == nullptr) {
          wsTopic = WebSocketManager::m_wsTopics[idx] = new WebSocketTopic(topic); 
          break;
        }
      }
    }
    assert(wsTopic != nullptr);
    return wsTopic;
  }
  
};

WebSocketTopic* WebSocketManager::m_wsTopics[MAX_TOPICS] = {0};
WebSocketManager WebSocketHandler::m_wsManager;

void WebSocketHandler::onClose() {
  this->m_parent->removeHandler(this);
}

// handle incoming request, send response
void WebSocketHandler::onMessage(WebsocketInputStreambuf *stream) {
  
  // Get the input message
  std::ostringstream ss;
  std::string msg;
  ss << stream;
  msg = ss.str();
  
  Serial.println(String("WebSocketHandler::onMessage: ") + msg.c_str());
  
  // set client callback before sending back to client
  if (nullptr != this->m_parent->m_hdlPreCb) {
    Serial.println("WebSocketHandler::onMessage - m_hdlPreCb");
    msg = this->m_parent->m_hdlPreCb(msg);
  }
  
  // send back response now!
  this->m_parent->sendToAllClients(msg);
  
  // set client callback after message was sent to client
  if (nullptr != this->m_parent->m_hdlPostCb) {
    Serial.println("WebSocketHandler::onMessage - m_hdlPostCb");
    this->m_parent->m_hdlPostCb(msg);
  }
}

WebSocketHandler* WebSocketHandler::create(const std::string& _topic) {
  WebSocketTopic *t = WebSocketHandler::m_wsManager.topic(_topic.c_str());
  return t->subscribe();
}

typedef WebSocketHandler* (WebSocketHandlerCreator)(const std::string&);

/**
 * class WebSocketNode
 * 
 * NOTE: For the inherittance to work WebsocketNode had to be updated to
 *  an abstract class, makeing method newHandler() virtual and setting creatorFunction 
 *  self initialized to be ignored by child class and use its own custom create callback.
 *  
 *  REVISED ESP32_HTTPS_Server WebsocketNode class declaration: 
 *  
 *    Update your version of this lib in WebsocketNode.hpp accordingly.
 *  
 *  class WebsocketNode : public HTTPNode {
 *   public:
 *     WebsocketNode(const std::string &path, const WebsocketHandlerCreator creatorFunction, const std::string &tag = "");
 *     WebsocketNode(const std::string &path, const std::string &tag = ""):
 *       HTTPNode(path, WEBSOCKET, tag) {
 *     };
 *     virtual ~WebsocketNode();
 *     virtual WebsocketHandler* newHandler();
 *     std::string getMethod() { return std::string("GET"); }
 *   private:
 *     const WebsocketHandlerCreator * _creatorFunction = nullptr;
 *   };
 *   
 */
class WebSocketNode : public WebsocketNode {
private:
  const WebSocketHandlerCreator * _child_creatorFunction;
public:
  WebSocketNode(
    const std::string &path,
    const WebSocketHandlerCreator *creatorFunction,
    const std::string &tag = ""
  ): WebsocketNode(path, tag), 
     _child_creatorFunction(creatorFunction) {
  }
  
  virtual ~WebSocketNode(){};
  std::string getMethod() { return std::string("GET"); }
  
  WebsocketHandler* newHandler() {
    Serial.println("FROM WebSocketHandler::newHandler()");
    if (0 >= this->_path.length()) {
      Serial.println("ERROR: topic _path not defined!");
    }
    Serial.println(this->_path.c_str());
    WebSocketHandler *handler = _child_creatorFunction(this->_path);
    return handler;
  }
};

#endif // _yt_web_socket_service_H_
