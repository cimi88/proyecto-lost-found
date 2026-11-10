import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AssistantPageComponent } from '../pages/assistant-page.component';

@Component({
  selector: 'app-assistant-widget',
  imports: [AssistantPageComponent],
  templateUrl: './assistant-widget.component.html',
  styleUrl: './assistant-widget.component.scss',
})
export class AssistantWidgetComponent {
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly isAssistantPage = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/assistant')),
    ),
    { initialValue: this.router.url.startsWith('/assistant') },
  );

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
  }
}
