import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, signal, ViewChild } from '@angular/core';
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
    this.messages.set(chat.messages || []);
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

  onSendMessage(event: Event, value: string) {
    event.preventDefault();
    if (value && value.trim() && this.currentChatId()) {
      this.handleFullChatFlow(value.trim());
    }
  }

  async handleFullChatFlow(userMessage: string) {
    if (!this.currentChatId) return;
    this.messages.update(msgs => [...msgs, { role: 'user', content: userMessage }]);
    this.scrollToBottom();
    await this.sendMessageToChat(this.currentChatId() || '', 'user', userMessage);
    this.messages.update(msgs => [...msgs, { role: 'assistant', content: '' }]);

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
            this.scrollToBottom();
          } catch (e) {
            console.error('Streaming parse error:', e);
          }
        }
      }
    }
    if (!fullAIResponse.trim()) {
      this.messages.update(msgs => msgs.slice(0, -1)); // Remove assistant placeholder
    } else {
      await this.sendMessageToChat(this.currentChatId() || '', 'assistant', fullAIResponse);
    }
  }
}
