export interface ClientMessage {
  type: 'voice_input' | 'command' | 'resize' | 'ping';
  text?: string;
  cols?: number;
  rows?: number;
}

export interface ServerMessage {
  type: 'output' | 'ai_response' | 'error' | 'status' | 'pong';
  data?: string;
  text?: string;
  message?: string;
}

export interface ToolInput {
  command?: string;
  text?: string;
}
