export {
  AgiChatWidgetElement,
  AGICHAT_WIDGET_TAG,
  defineAgiChatWidget,
} from './widget/agichat-widget';
export type { AgiChatWidgetEventName } from './widget/agichat-widget';
export { renderMarkdown } from './widget/markdown';
export { MockAgentTransport } from './transport/mock-transport';
export type { MockAgentTransportOptions } from './transport/mock-transport';
export { WebSocketAgentTransport } from './transport/websocket-transport';
export type { WebSocketAgentTransportOptions } from './transport/websocket-transport';
export { MessageStore } from './core/message-store';
export { createId } from './core/id';
export type {
  AgentTransport,
  ChatMessage,
  MessageRole,
  MessageStatus,
  ConnectionStatus,
  MovieCard,
  AgentAction,
  AgentActionSite,
} from './core/types';

import { defineAgiChatWidget } from './widget/agichat-widget';

defineAgiChatWidget();
