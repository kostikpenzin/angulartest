import {
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { SnackbarService } from 'ngx-snackbar';
import { Subject } from 'rxjs';
import {
  AdsService,
  AuthService,
  CONFIG_INJECTION_TOKEN,
  ConfigService,
  HeaderService,
  UserService,
} from '@cr/services';
import { filter, map, switchMap, takeUntil } from 'rxjs/operators';
import { NavigationEnd, Router } from '@angular/router';
import { Ads, Config } from '@cr/interfaces';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';

@Component({
  selector: 'cr-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy, OnInit {
  showBurger = false;
  showPersonalCabinetMenu = false;
  isMobile = false;
  isDesktop = false;
  isLoginPage = false;
  isRegistrationPage = false;
  isRecoveryPage = false;
  isPending = false;
  token$ = this._authService.token$;
  ads: Ads;
  header$ = this._headerService.header$;

  private _snackbarOptions: any = {
    msg: '',
    timeout: 5000,
    background: '#04222D',
    color: '#ffffff',
    action: {
      text: 'OK',
    },
  };

  private _unsubscribe$: Subject<void> = new Subject<void>();

  @ViewChild('rightSide') rightSide: ElementRef;
  @ViewChild('leftSide', { static: true }) leftSide: ElementRef;
  @ViewChild('searchInput') searchInput: ElementRef;

  @HostListener('window:scroll', ['$event.target'])
  windowScroll(evt): void {
    if (
      this.isDesktop &&
      this.rightSide &&
      !this.isLoginPage &&
      !this.isRegistrationPage &&
      !this.isRecoveryPage
    ) {
      const elem = this.rightSide.nativeElement;

      if (
        this.rightSide.nativeElement.offsetHeight +
          evt.documentElement.scrollTop >
        this.leftSide.nativeElement.offsetHeight
      ) {
        this._renderer.setStyle(
          elem,
          'top',
          `${
            this.leftSide.nativeElement.offsetHeight -
            this.rightSide.nativeElement.offsetHeight
          }px`
        );
      } else {
        this._renderer.setStyle(
          elem,
          'top',
          `${evt.documentElement.scrollTop}px`
        );
      }
    }
  }

  constructor(
    @Inject(CONFIG_INJECTION_TOKEN) private _config: Config,
    private _snackbarService: SnackbarService,
    private _configService: ConfigService,
    private _authService: AuthService,
    private _userService: UserService,
    private _router: Router,
    private _renderer: Renderer2,
    private _breakpointObserver: BreakpointObserver,
    private _adsService: AdsService,
    private _headerService: HeaderService
  ) {}

  ngOnDestroy(): void {
    this._unsubscribe$.next();
    this._unsubscribe$.complete();
  }

  ngOnInit(): void {
    this._handleToken();
    this._handleURL();
    this._handleSnackbar();
    this._handleBreakpoints();
  }

  showBurgerMenu(): void {
    this.showBurger = !this.showBurger;

    if (!this.showBurger) {
      this.showPersonalCabinetMenu = false;
    }
  }

  showPKMenu(): void {
    this.showPersonalCabinetMenu = !this.showPersonalCabinetMenu;
  }

  navigateTo(url: string): void {
    this.showBurger = false;
    this.showPersonalCabinetMenu = false;
    this._router.navigate([`${url}`]);
  }

  handleAuthButton(): void {
    if (this.isLoginPage) {
      this.navigateTo('login');
    } else {
      this._logout();
    }
  }

  /*focusSearchInput(): void {
    this.searchInput.nativeElement.focus();
  }*/

  private _handleToken(): void {
    this._authService.token$
      .pipe(
        filter((res) => !!res),
        switchMap(() => this._userService.getUser()),
        takeUntil(this._unsubscribe$)
      )
      .subscribe((res) => {
        this._configService.user$.next(res);
        this._config.offersCount = +res?.OFFERS_PER_PAGE || 5;
      });
  }

  private _handleURL(): void {
    this._router.events
      .pipe(
        filter((evt) => evt instanceof NavigationEnd),
        switchMap((res: NavigationEnd) => {
          this.isLoginPage = res.url === '/login';
          this.isRegistrationPage = res.url.includes('/registration');
          this.isRecoveryPage = res.url === '/recovery';
          this.ads = null;
          this._configService.ads$.next(null);

          const url = res.urlAfterRedirects;
          const source = url.slice(
            url.indexOf('/') + 1,
            url.indexOf('?') !== -1 ? url.indexOf('?') : url.length
          );
          return this._adsService.getAds(source);
        }),
        map((res) => {
          Object.keys(res).forEach((key) => {
            if (res[key].length && res[key][0].img) {
              res[key].img = this._config.imgUrl + res[key].img;
            }
          });

          return res;
        }),
        takeUntil(this._unsubscribe$)
      )
      .subscribe((res) => {
        this._configService.ads$.next(res);
        this.ads = res;
      });
  }

  private _handleSnackbar(): void {
    this._configService.snackbar$
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((res: any) => {
        this._snackbarOptions = {
          ...this._snackbarOptions,
          ...res,
        };

        this._snackbarService.add(this._snackbarOptions);
      });
  }

  private _handleBreakpoints(): void {
    this._breakpointObserver
      .observe(['(max-width: 767px)', '(min-width: 1240px)'])
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((state: BreakpointState) => {
        this.isMobile = state.breakpoints['(max-width: 767px)'];
        this.isDesktop = state.breakpoints['(min-width: 1240px)'];
      });
  }

  private _logout(): void {
    const handleLogout = () => {
      this.isPending = false;
      this.showBurger = false;
      this.showPersonalCabinetMenu = false;
      this.navigateTo('login');
    };

    this.isPending = true;

    this._authService
      .logout()
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe(handleLogout, handleLogout);
  }
}
