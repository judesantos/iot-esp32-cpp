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
typedef void (*fnHdlPostCb)(std::string& msg);

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
  fnHdlPreCb m_hdlPreCb = nullptr;
  fnHdlPostCb m_hdlPostCb = nullptr;
  uint32_t m_numSubscribers = 0;
  WebSocketHandler *m_wsHandlers[MAX_TOPIC_SUBSCRIBERS] = {0};
public:
  std::string name; // topic name

  WebSocketTopic(const char *topic) {
    this->name = topic;
  }

  int numSubscribers() {
    return this->m_numSubscribers;
  }

  void handlePreProcessRequest(const std::string& req, std::string& res) {
    Serial.printf("WebSocketHandler::handlePreProcessRequest(%s:%d)\n", this->name.c_str(), this);
    if (nullptr != this->m_hdlPreCb) {
      res = this->m_hdlPreCb(req);
    }
  }

  void handlePostProcessRequest(std::string& res) {
    Serial.printf("WebSocketHandler::handlePostProcessRequest(%s:%d)\n", this->name.c_str(), this);
    if (nullptr != this->m_hdlPostCb) {
      this->m_hdlPostCb(res);
    }
  }

  void registerPreProcessHandler(fnHdlPreCb cb) {
    Serial.printf("WebSocketTopic::registerPreProcessHandler(%s:%d) - cb(%d)\n", 
      this->name.c_str(), this, cb);
    this->m_hdlPreCb = cb;
  }

  void registerPostProcessHandler(fnHdlPostCb cb) {
    Serial.printf("WebSocketTopic::registerPostProcessHandler(%s:%d) - cb(%d)\n", 
      this->name.c_str(), this, cb);
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
        this->m_numSubscribers--;
      }
    }
  }

  WebSocketHandler* subscribe() {
    WebSocketHandler *handler = nullptr;
    for (int idx = 0; idx < MAX_TOPIC_SUBSCRIBERS; idx++) {
      if (nullptr == this->m_wsHandlers[idx]) {
        handler = new WebSocketHandler(this);
        this->m_wsHandlers[idx] = handler;
        this->m_numSubscribers++;
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
    Serial.printf("WebSocketManager::topic(%s)\n", topic);
    WebSocketTopic *wsTopic = nullptr;
    for (int idx = 0; idx < MAX_TOPICS; idx++) {
      // check if exists
      if (nullptr != WebSocketManager::m_wsTopics[idx]) {
        Serial.printf("search topic item '%s:%d'\n",
          WebSocketManager::m_wsTopics[idx]->name.c_str(), 
            WebSocketManager::m_wsTopics[idx]);
      }
      if (
        nullptr != WebSocketManager::m_wsTopics[idx] && 
        topic == WebSocketManager::m_wsTopics[idx]->name
      ) {
        Serial.printf("found topic '%s:%d'\n", topic, WebSocketManager::m_wsTopics[idx]);
        wsTopic = WebSocketManager::m_wsTopics[idx];
        break;
      }
    }
    //create topic if not exists
    if (wsTopic == nullptr) {
      for (int idx = 0; idx < MAX_TOPICS; idx++) {
        if (WebSocketManager::m_wsTopics[idx] == nullptr) {
          wsTopic = WebSocketManager::m_wsTopics[idx] = new WebSocketTopic(topic); 
          Serial.printf("created new topic instance '%s:%d'\n", topic, wsTopic);
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
  std::string req;
  std::string res;
  ss << stream;
  req = ss.str();
  
  Serial.printf("WebSocketHandler::onMessage(%s) : %s\n", 
    this->m_parent->name.c_str(), req.c_str());
  // pre-process request 
  this->m_parent->handlePreProcessRequest(req, res);
  // post-process request 
  this->m_parent->handlePostProcessRequest(res);
  // send back response now!
  this->send(res, WebsocketHandler::SEND_TYPE_TEXT);
}

WebSocketHandler* WebSocketHandler::create(const std::string& _topic) {
  Serial.printf("WebSocketHandler::create() - register topic('%s')\n", _topic.c_str());
  WebSocketTopic *t = WebSocketHandler::m_wsManager.topic(_topic.c_str());
  return t->subscribe();
}

/**
 * class WebSocketNode (check typecase of 'socket' in WebsocketNode vs WebSocketNode)
 *
 *    Extends ESP32_HTTPS_SERVER WebsocketNode's createFunction(0 argument) 
 *    and allow storing of topic passed as string parameter to a modified 
 *    createFunction(string topicName). 
 *
 *    This allows for an application to hoard the ws topics and handlers in a list/map,
 *    and thus control over the lifetime and delegation of outbound (push/publish) 
 *    and inbound (pull/subscribe) messages.
 * 
 * NOTE: For the inherittance to work, WebsocketNode need to be updated to
 *  an abstract class, making method newHandler() virtual and setting creatorFunction 
 *  self initialized to be ignored by child class and use its own custom create callback.
 *  
 *  REVISED ESP32_HTTPS_Server WebsocketNode class declaration: 
 *  
 *  Update your version of this lib in WebsocketNode.hpp accordingly:
 *  
 *    class WebsocketNode : public HTTPNode {
 *     public:
 *       WebsocketNode(
 *        const std::string &path,
 *        const WebsocketHandlerCreator creatorFunction, const std::string &tag = ""
 *       );
 *       WebsocketNode(const std::string &path, const std::string &tag = ""):
 *         HTTPNode(path, WEBSOCKET, tag) {
 *       };
 *       virtual ~WebsocketNode();
 *       virtual WebsocketHandler* newHandler();
 *       std::string getMethod() { return std::string("GET"); }
 *     private:
 *       const WebsocketHandlerCreator * _creatorFunction = nullptr;
 *    };
 *   
 */

// New creation callback method, with 1 parameter for the topic name
typedef WebSocketHandler* (*fnWebSocketHandlerCreator)(const std::string&);

class WebSocketNode : public WebsocketNode {
private:
  const fnWebSocketHandlerCreator _child_creatorFunction = nullptr;
public:
  WebSocketNode(
    const std::string &path,
    const fnWebSocketHandlerCreator creatorFunction,
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
