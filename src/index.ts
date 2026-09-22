export {
  AgiChatWidgetElement,
  AGICHAT_WIDGET_TAG,
  defineAgiChatWidget,
} from './widget/agichat-widget';
export { MockAgentTransport } from './transport/mock-transport';
export type { MockAgentTransportOptions } from './transport/mock-transport';
export { MessageStore } from './core/message-store';
export { createId } from './core/id';
export type {
  AgentTransport,
  ChatMessage,
  MessageRole,
  MessageStatus,
  ConnectionStatus,
} from './core/types';

import { defineAgiChatWidget } from './widget/agichat-widget';

defineAgiChatWidget();
