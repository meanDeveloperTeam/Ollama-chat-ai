import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, signal, ViewChild } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  animations: [
    trigger('sidebarCollapse', [
      state('expanded', style({ width: '260px', minWidth: '200px', opacity: 1 })),
      state('collapsed', style({ width: '0', minWidth: '0', opacity: 0 })),
      transition('expanded <=> collapsed', [
        animate('300ms cubic-bezier(0.4,0,0.2,1)')
      ]),
    ])
  ]
})
export class App implements OnInit {
  protected readonly title = signal('ollama-chat-ai');
  protected readonly sidebarCollapsed = signal(false);
  @ViewChild('chatContainer') chatContainer!: ElementRef;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLTextAreaElement>;

  ngOnInit() {
    this.loadChats();
  }

  chats = signal<any[]>([]);
  currentChatId = signal<string | null>(null);
  public messages = signal<
    { role: 'user' | 'assistant', blocks: { type: 'text' | 'code' | 'think', content: string }[] }[]
  >([]);

  protected toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  protected get sidebarState() {
    return this.sidebarCollapsed() ? 'collapsed' : 'expanded';
  }

  trackByChatId(index: number, chat: any) {
    return chat._id;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.chatContainer?.nativeElement?.scrollTo({
        top: this.chatContainer.nativeElement.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }

  async loadChats() {
    const res = await fetch('http://localhost:3000/api/chats');
    this.chats.set(await res.json());
    this.currentChatId.set(this.chats().length > 0 ? this.chats()[0]._id : null);
    if (this.currentChatId()) {
      this.loadChat(this.currentChatId() || '');
    } else {
      this.messages.set([]);
    }
  }

  async loadChat(chatId: string) {
    const res = await fetch(`http://localhost:3000/api/chats/${chatId}`);
    const chat = await res.json();
    this.currentChatId.set(chatId);

    const parsedMessages = (chat.messages || []).map((msg: any) => {
      if (msg.blocks) {
        return msg; // Already in new format
      } else {
        // Convert from old format (with content string)
        return {
          role: msg.role,
          blocks: this.parseAssistantResponse(msg.content || '')
        };
      }
    });

    this.messages.set(parsedMessages);
    this.scrollToBottom();
  }

  async createChat(title: string) {
    const res = await fetch('http://localhost:3000/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, messages: [] })
    });
    const data = await res.json();
    this.loadChats();
    this.loadChat(data.chatId);
  }

  async sendMessageToChat(chatId: string, role: 'user' | 'assistant', content: string) {
    await fetch(`http://localhost:3000/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content })
    });
  }

  /* ---------------- Chat / Message Deletion ----------------*/
  async deleteChat(chatId: string) {
    if (!confirm('Delete this chat?')) return;
    await fetch(`http://localhost:3000/api/chats/${chatId}`, {
      method: 'DELETE'
    });
    await this.loadChats();
    // Auto-load first chat if any
    if (this.chats().length > 0) {
      this.loadChat(this.chats()[0]._id);
    } else {
      this.currentChatId.set(null);
      this.messages.set([]);
    }
  }

  async deleteMessage(index: number) {
    if (!confirm('Delete this message?')) return;
    // Optimistically remove locally
    this.messages.update(msgs => {
      const updated = [...msgs];
      updated.splice(index, 1);
      return updated;
    });

    // Persist change on server (simple PUT replacing all messages)
    if (this.currentChatId()) {
      await fetch(`http://localhost:3000/api/chats/${this.currentChatId()}/messages/${index}`, {
        method: 'DELETE'
      }).catch(() => {}); // ignore error for now
    }
  }

  @HostListener('input', ['$event.target'])
  onInput(textArea: EventTarget | null): void {
    if (textArea) {
      this.adjustTextareaHeight(textArea as HTMLTextAreaElement);
    }
  }

  private adjustTextareaHeight(textArea: HTMLTextAreaElement): void {
    textArea.style.height = 'auto';
    textArea.style.height = textArea.scrollHeight + 'px';
  }

  onSendMessage(event: Event, value: string) {
    event.preventDefault();
    if (value && value.trim() && this.currentChatId()) {
      this.handleFullChatFlow(value.trim());
      this.chatInput.nativeElement.value = ''; // Clear the textarea
      this.adjustTextareaHeight(this.chatInput.nativeElement); // Reset textarea height
    }
  }

  parseAssistantResponse(fullText: string): { type: 'text' | 'code' | 'think', content: string }[] {
    const parts: { type: 'text' | 'code' | 'think', content: string }[] = [];

    // Matches both code blocks and <think> blocks
    const combinedRegex = /```(.*?)```|<think>([\s\S]*?)<\/think>/gs;

    let lastIndex = 0;

    for (const match of fullText.matchAll(combinedRegex)) {
      const matchIndex = match.index!;

      // Add preceding plain text
      if (matchIndex > lastIndex) {
        parts.push({ type: 'text', content: fullText.slice(lastIndex, matchIndex) });
      }

      if (match[1]) {
        // code block
        parts.push({ type: 'code', content: match[1].trim() });
      } else if (match[2]) {
        // think block
        parts.push({ type: 'think', content: match[2].trim() });
      }

      lastIndex = matchIndex + match[0].length;
    }

    // Add any remaining plain text
    if (lastIndex < fullText.length) {
      parts.push({ type: 'text', content: fullText.slice(lastIndex) });
    }

    return parts;
  }


  async handleFullChatFlow(userMessage: string) {
    if (!this.currentChatId) return;

    this.messages.update(msgs => [...msgs, {
      role: 'user',
      blocks: [{ type: 'text', content: userMessage }]
    }]);
    this.scrollToBottom();
    await this.sendMessageToChat(this.currentChatId() || '', 'user', userMessage);

    // Temporary assistant placeholder
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      blocks: []
    }]);

    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userMessage, chatId: this.currentChatId() })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullAIResponse = '';

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            const chunk = json.response || '';
            fullAIResponse += chunk;
            // Update assistant message blocks incrementally to show streaming response
            // Update assistant message blocks incrementally to show streaming response
            this.messages.update(msgs => {
              const updated = [...msgs];
              if (updated.length > 0) {
                const last = updated[updated.length - 1];
                if (last.role === 'assistant') {
                  last.blocks = this.parseAssistantResponse(fullAIResponse);
                }
              }
              return updated;
            });
            this.scrollToBottom();
          } catch { }
        }
      }
    }

    // After streaming is complete, save the full response to the chat history
    if (fullAIResponse.length > 0) {
      await this.sendMessageToChat(this.currentChatId() || '', 'assistant', fullAIResponse);
    } else {
      // If no content was streamed, remove the temporary assistant message
      this.messages.update(msgs => msgs.slice(0, -1));
    }
  }
}
