import type { Routes } from '@angular/router';
import { AdminGuard } from './core/admin.guard';
import {
  DemoAuthGuard,
  DemoGuestGuard,
} from './core/demo-auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [DemoGuestGuard],
    loadComponent: () =>
      import('./auth/pages/access-page.component').then(
        (module) => module.AccessPageComponent,
      ),
  },
  {
    path: 'register',
    canActivate: [DemoGuestGuard],
    loadComponent: () =>
      import('./auth/pages/register-page.component').then(
        (module) => module.RegisterPageComponent,
      ),
  },
  {
    path: 'login',
    canActivate: [DemoGuestGuard],
    loadComponent: () =>
      import('./auth/pages/login-page.component').then(
        (module) => module.LoginPageComponent,
      ),
  },
  {
    path: 'lost',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './publications/pages/create-lost-publication-page.component'
      ).then((module) => module.CreateLostPublicationPageComponent),
  },
  {
    path: 'found',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './publications/pages/create-found-publication-page.component'
      ).then((module) => module.CreateFoundPublicationPageComponent),
  },
  {
    path: 'assistant',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import('./assistant/pages/assistant-page.component').then(
        (module) => module.AssistantPageComponent,
      ),
  },
  {
    path: 'publications',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import('./publications/pages/publication-list-page.component').then(
        (module) => module.PublicationListPageComponent,
      ),
  },
  {
    path: 'publications/:id',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import('./publications/pages/publication-detail-page.component').then(
        (module) => module.PublicationDetailPageComponent,
      ),
  },
  {
    path: 'my-publications',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './publications/pages/my-publications-page.component'
      ).then((module) => module.MyPublicationsPageComponent),
  },
  {
    path: 'my-publications/:id/edit',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './publications/pages/edit-publication-page.component'
      ).then((module) => module.EditPublicationPageComponent),
  },
  {
    path: 'my-publications/:id',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './publications/pages/my-publication-detail-page.component'
      ).then((module) => module.MyPublicationDetailPageComponent),
  },
  {
    path: 'admin/publications',
    canActivate: [DemoAuthGuard, AdminGuard],
    loadComponent: () =>
      import(
        './publications/pages/admin-publications-page.component'
      ).then((module) => module.AdminPublicationsPageComponent),
  },
  {
    path: 'recovery-requests/received',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './recovery-requests/pages/received-recovery-requests-page.component'
      ).then((module) => module.ReceivedRecoveryRequestsPageComponent),
  },
  {
    path: 'recovery-requests',
    canActivate: [DemoAuthGuard],
    loadComponent: () =>
      import(
        './recovery-requests/pages/my-recovery-requests-page.component'
      ).then((module) => module.MyRecoveryRequestsPageComponent),
  },
  { path: '**', redirectTo: '' },
];
