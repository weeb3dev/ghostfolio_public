import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  AgentChatMessageItem,
  AgentConversationItem,
  User
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { IonIcon } from '@ionic/angular/standalone';
import { MarkdownModule } from 'ngx-markdown';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chatbubbleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  sendOutline
} from 'ionicons/icons';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  confidence?: string;
  createdAt?: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    MarkdownModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatSidenavModule
  ],
  selector: 'gf-agent-chat-page',
  styleUrls: ['./agent-chat-page.component.scss'],
  templateUrl: './agent-chat-page.component.html'
})
export class GfAgentChatPageComponent implements OnInit, OnDestroy {
  private static readonly DEFAULT_MESSAGES: readonly string[] = [
    'Analyzing your request...',
    'Retrieving portfolio data...',
    'Processing holdings information...',
    'Running analysis...',
    'Generating response...'
  ];

  private static readonly STOCK_ACT_MESSAGES: readonly string[] = [
    'Loading congressional portfolio data...',
    'Analyzing Pelosi portfolio...',
    'Analyzing Tuberville portfolio...',
    'Analyzing Crenshaw portfolio...',
    'Analyzing Wyden portfolio...',
    'Analyzing Greene portfolio...',
    'Analyzing Gottheimer portfolio...',
    'Comparing portfolio profiles...',
    'Generating summary...'
  ];

  @ViewChild('messageContainer') private messageContainer: ElementRef;
  @ViewChild('messageInput') private messageInput: ElementRef;

  public conversations: AgentConversationItem[] = [];
  public conversationId: string | undefined;
  public isLoading = false;
  public isSidebarOpen = true;
  public loadingStatus = '';
  public messageText = '';
  public messages: ChatMessage[] = [];
  public user: User;

  private isStockActQuery = false;
  private loadingMessageIndex = 0;
  private loadingTimerId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private userService: UserService
  ) {
    addIcons({
      addOutline,
      chatbubbleOutline,
      chevronBackOutline,
      chevronForwardOutline,
      sendOutline
    });
  }

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;
          this.changeDetectorRef.markForCheck();
        }
      });

    this.loadConversations();
  }

  public ngOnDestroy() {
    this.stopLoadingMessages();
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onNewConversation() {
    this.conversationId = undefined;
    this.messages = [];
    this.changeDetectorRef.markForCheck();

    setTimeout(() => this.messageInput?.nativeElement?.focus());
  }

  public onSelectConversation(conversationId: string) {
    this.conversationId = conversationId;
    this.messages = [];
    this.isLoading = true;
    this.changeDetectorRef.markForCheck();

    this.dataService
      .fetchAgentConversation(conversationId)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (items: AgentChatMessageItem[]) => {
          this.messages = items.map((item) => ({
            role: item.role,
            content: item.content,
            toolsUsed: item.toolCalls,
            confidence: item.confidence,
            createdAt: item.createdAt
          }));
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
          this.scrollToBottom();
        },
        error: () => {
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public onSendMessage() {
    const text = this.messageText.trim();

    if (!text || this.isLoading) {
      return;
    }

    this.messages.push({ role: 'user', content: text });
    this.messageText = '';
    this.isLoading = true;
    this.startLoadingMessages(text);
    this.changeDetectorRef.markForCheck();
    this.scrollToBottom();

    this.dataService
      .postAgentChat({
        message: text,
        conversationId: this.conversationId
      })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (response) => {
          this.stopLoadingMessages();
          this.conversationId = response.conversationId;

          this.messages.push({
            role: 'assistant',
            content: response.response,
            toolsUsed: response.toolsUsed,
            confidence: response.confidence
          });

          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
          this.scrollToBottom();
          this.loadConversations();
        },
        error: () => {
          this.stopLoadingMessages();
          this.messages.push({
            role: 'assistant',
            content:
              'Sorry, something went wrong. Please try again.'
          });
          this.isLoading = false;
          this.changeDetectorRef.markForCheck();
          this.scrollToBottom();
        }
      });
  }

  public onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendMessage();
    }
  }

  public toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.changeDetectorRef.markForCheck();
  }

  public getConfidenceClass(confidence: string | undefined): string {
    switch (confidence) {
      case 'high':
        return 'confidence-high';
      case 'medium':
        return 'confidence-medium';
      case 'low':
        return 'confidence-low';
      default:
        return 'confidence-medium';
    }
  }

  public formatToolName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private startLoadingMessages(query: string) {
    this.stopLoadingMessages();

    const stockActPrompt =
      'List all available STOCK Act congressional portfolios and give me a brief summary of each.';
    const lowerQuery = query.toLowerCase();

    this.isStockActQuery =
      query === stockActPrompt ||
      (lowerQuery.includes('stock act') &&
        lowerQuery.includes('congressional'));

    const messages = this.isStockActQuery
      ? GfAgentChatPageComponent.STOCK_ACT_MESSAGES
      : GfAgentChatPageComponent.DEFAULT_MESSAGES;

    this.loadingMessageIndex = 0;
    this.loadingStatus = messages[0];

    this.loadingTimerId = setInterval(() => {
      this.loadingMessageIndex++;

      if (this.isStockActQuery) {
        this.loadingMessageIndex = Math.min(
          this.loadingMessageIndex,
          messages.length - 1
        );
      } else {
        this.loadingMessageIndex =
          this.loadingMessageIndex % messages.length;
      }

      this.loadingStatus = messages[this.loadingMessageIndex];
      this.changeDetectorRef.markForCheck();
    }, 3000);
  }

  private stopLoadingMessages() {
    if (this.loadingTimerId !== null) {
      clearInterval(this.loadingTimerId);
      this.loadingTimerId = null;
    }

    this.loadingStatus = '';
    this.loadingMessageIndex = 0;
    this.isStockActQuery = false;
  }

  private loadConversations() {
    this.dataService
      .fetchAgentConversations()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: (conversations) => {
          this.conversations = conversations;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.messageContainer?.nativeElement;

      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
