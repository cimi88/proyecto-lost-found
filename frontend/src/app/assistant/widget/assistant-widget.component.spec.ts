import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import type { AssistantConversation } from '../models/assistant.models';
import { AssistantPageComponent } from '../pages/assistant-page.component';
import { AssistantConversationStorage } from '../services/assistant-conversation-storage.service';
import { AssistantWidgetComponent } from './assistant-widget.component';

describe('AssistantWidgetComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('opens and closes the panel while keeping the chat mounted', () => {
    const fixture = TestBed.createComponent(AssistantWidgetComponent);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      '[data-testid="assistant-widget-toggle"]',
    ) as HTMLButtonElement;
    const panel = fixture.nativeElement.querySelector(
      '[data-testid="assistant-widget-panel"]',
    ) as HTMLElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Chat');
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(panel.classList).not.toContain('is-open');
    expect(
      fixture.debugElement.query(By.directive(AssistantPageComponent)),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.page-header'),
    ).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Cerrar');
    expect(panel.classList).toContain('is-open');

    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-close"]')
      .click();
    fixture.detectChanges();

    expect(panel.classList).not.toContain('is-open');
    expect(
      fixture.debugElement.query(By.directive(AssistantPageComponent)),
    ).not.toBeNull();

    const widgetChat = fixture.debugElement.query(
      By.directive(AssistantPageComponent),
    ).componentInstance as AssistantPageComponent;
    const standalone = TestBed.createComponent(AssistantPageComponent);
    standalone.detectChanges();

    expect(widgetChat.conversationId).toBe(
      standalone.componentInstance.conversationId,
    );
  });

  it('shares messages with a standalone assistant page', () => {
    const fixture = TestBed.createComponent(AssistantWidgetComponent);
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-toggle"]')
      .click();
    fixture.detectChanges();

    const widgetChat = fixture.debugElement.query(
      By.directive(AssistantPageComponent),
    ).componentInstance as AssistantPageComponent;
    const standalone = TestBed.createComponent(AssistantPageComponent);
    standalone.detectChanges();

    widgetChat.input.setValue('Mensaje compartido');
    widgetChat.send();
    expect(standalone.componentInstance.loading()).toBe(true);

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta compartida', role: 'USER' });
    fixture.detectChanges();
    standalone.detectChanges();

    expect(standalone.componentInstance.messages()).toEqual(
      widgetChat.messages(),
    );
    expect(standalone.componentInstance.messages()).toHaveLength(2);
  });

  it('shares a selected historical conversation with a standalone page', () => {
    const historical: AssistantConversation = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Histórica compartida',
      createdAt: '2026-11-09T10:00:00.000Z',
      updatedAt: '2026-11-09T12:00:00.000Z',
      messages: [
        { role: 'user', content: 'Mensaje histórico' },
        { role: 'assistant', content: 'Respuesta histórica' },
      ],
    };
    TestBed.inject(AssistantConversationStorage).save([historical]);

    const fixture = TestBed.createComponent(AssistantWidgetComponent);
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-toggle"]')
      .click();
    fixture.detectChanges();

    const widgetChat = fixture.debugElement.query(
      By.directive(AssistantPageComponent),
    ).componentInstance as AssistantPageComponent;
    const standalone = TestBed.createComponent(AssistantPageComponent);
    standalone.detectChanges();

    widgetChat.selectConversation(historical.id);
    fixture.detectChanges();
    standalone.detectChanges();

    expect(widgetChat.isReadOnly()).toBe(true);
    expect(standalone.componentInstance.isReadOnly()).toBe(true);
    expect(standalone.componentInstance.messages()).toEqual(
      widgetChat.messages(),
    );
    expect(widgetChat.messages()).toHaveLength(2);
  });

  it('keeps messages when the panel is closed and reopened', () => {
    const fixture = TestBed.createComponent(AssistantWidgetComponent);
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-toggle"]')
      .click();
    fixture.detectChanges();

    const chat = fixture.debugElement.query(
      By.directive(AssistantPageComponent),
    ).componentInstance as AssistantPageComponent;
    const conversationId = chat.conversationId;
    chat.input.setValue('Hola');
    chat.send();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta visible', role: 'USER' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Respuesta visible');

    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-close"]')
      .click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Respuesta visible');

    fixture.nativeElement
      .querySelector('[data-testid="assistant-widget-toggle"]')
      .click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Respuesta visible');
    expect(chat.conversationId).toBe(conversationId);
  });
});
