import Anthropic from '@anthropic-ai/sdk';
import { ToolInput } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_command',
    description:
      'Execute a shell command in the user\'s terminal. Use this to fulfill requests like "list files", "show disk usage", "run tests", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g. "ls -la", "git status", "npm test")',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'speak',
    description:
      'Send a spoken response back to the user without running a command. Use this to answer questions, explain something, or acknowledge a request.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The text to speak aloud to the user',
        },
      },
      required: ['text'],
    },
  },
];

const SYSTEM_PROMPT = `You are AetherLink, an AI voice assistant embedded in a live terminal.
The user speaks commands and questions to you. Your job is to:
1. Run shell commands when the user asks to do something in the terminal
2. Speak back a short, clear response summarizing what happened or answering their question

Keep spoken responses concise — 1-3 sentences. The user can see the full terminal output.
Always use the run_command or speak tool — never respond with plain text.`;

export interface ClaudeAction {
  type: 'command' | 'speak';
  value: string;
}

export async function processVoiceInput(
  userText: string,
  conversationHistory: Anthropic.MessageParam[]
): Promise<ClaudeAction> {
  conversationHistory.push({ role: 'user', content: userText });

  const response = await client.messages.create(
    {
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: conversationHistory,
    },
    { signal: AbortSignal.timeout(30_000) }
  );

  // Record assistant response in history
  conversationHistory.push({ role: 'assistant', content: response.content });

  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const input = block.input as ToolInput;
      if (block.name === 'run_command' && input.command) {
        return { type: 'command', value: input.command };
      }
      if (block.name === 'speak' && input.text) {
        return { type: 'speak', value: input.text };
      }
    }
  }

  // Fallback: extract any text from the response
  const textBlock = response.content.find(b => b.type === 'text');
  const fallbackText = textBlock && 'text' in textBlock ? textBlock.text : 'I did not understand that request.';
  return { type: 'speak', value: fallbackText };
}
