import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet],
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
export class App {
  protected readonly title = signal('ollama-chat-ai');
  protected readonly sidebarCollapsed = signal(false);

  ngOnInit() {
    this.loadChats();
  }

  chats = signal<any[]>([]);
  currentChatId = signal<string | null>(null);
  public messages = signal<{ role: 'user' | 'assistant', content: string }[]>([]);

  protected toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  protected get sidebarState() {
    return this.sidebarCollapsed() ? 'collapsed' : 'expanded';
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
    this.messages.set(chat.messages || []);
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

  onSendMessage(event: Event, value: string) {
    event.preventDefault();
    if (value && value.trim() && this.currentChatId()) {
      this.handleFullChatFlow(value.trim());
    }
  }

  async handleFullChatFlow(userMessage: string) {
    if (!this.currentChatId) return;
    this.messages.update(msgs => [...msgs, { role: 'user', content: userMessage }]);
    await this.sendMessageToChat(this.currentChatId()|| '', 'user', userMessage);
    this.messages.update(msgs => [...msgs, { role: 'assistant', content: '' }]);

    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userMessage })
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
            this.messages.update(msgs => {
              if (msgs.length > 0) {
                const updated = [...msgs];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + chunk
                };
                return updated;
              }
              return msgs;
            });
          } catch (e) {
          }
        }
      }
    }
    await this.sendMessageToChat(this.currentChatId() || '', 'assistant', fullAIResponse);
  }
}
