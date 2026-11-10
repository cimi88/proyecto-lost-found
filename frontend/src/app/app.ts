import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, RouterOutlet } from '@angular/router';
import { AssistantWidgetComponent } from './assistant/widget/assistant-widget.component';
import { AssistantConversationStore } from './assistant/services/assistant-conversation.store';
import { DemoSessionService } from './core/demo-session.service';
import { IdentityService } from './core/identity.service';
import {
  ThemeService,
  type ThemeMode,
  type ThemeVariant,
} from './core/theme.service';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AssistantWidgetComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  readonly theme = inject(ThemeService);
  readonly identity = inject(IdentityService);
  readonly session = inject(DemoSessionService);
  private readonly assistant = inject(AssistantConversationStore);
  private readonly router = inject(Router);
  readonly appearanceOpen = signal(false);

  readonly appearanceOptions: ReadonlyArray<{
    mode: ThemeMode;
    variant: ThemeVariant;
    label: string;
    swatchClass: string;
  }> = [
    {
      mode: 'light',
      variant: 1,
      label: 'Día · Variante 1',
      swatchClass: 'swatch-light-1',
    },
    {
      mode: 'light',
      variant: 2,
      label: 'Día · Variante 2',
      swatchClass: 'swatch-light-2',
    },
    {
      mode: 'dark',
      variant: 1,
      label: 'Noche · Variante 1',
      swatchClass: 'swatch-dark-1',
    },
    {
      mode: 'dark',
      variant: 2,
      label: 'Noche · Variante 2',
      swatchClass: 'swatch-dark-2',
    },
  ];

  constructor() {
    if (this.session.isAuthenticated()) {
      this.identity.load().subscribe({
        error: () => {
          this.session.clear();
          this.identity.reset();
          this.assistant.resetForIdentityChange();
          void this.router.navigateByUrl('/');
        },
      });
    }
  }

  logout(): void {
    this.session.clear();
    this.identity.reset();
    this.assistant.resetForIdentityChange();
    this.appearanceOpen.set(false);
    void this.router.navigateByUrl('/');
  }

  toggleAppearance(): void {
    this.appearanceOpen.update((open) => !open);
  }

  chooseAppearance(mode: ThemeMode, variant: ThemeVariant): void {
    this.theme.setTheme(mode, variant);
    this.appearanceOpen.set(false);
  }
}
