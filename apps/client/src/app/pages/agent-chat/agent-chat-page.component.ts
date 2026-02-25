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
  @ViewChild('messageContainer') private messageContainer: ElementRef;
  @ViewChild('messageInput') private messageInput: ElementRef;

  public conversations: AgentConversationItem[] = [];
  public conversationId: string | undefined;
  public isLoading = false;
  public isSidebarOpen = true;
  public messageText = '';
  public messages: ChatMessage[] = [];
  public user: User;

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
