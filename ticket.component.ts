import {
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { AddComment, Comment, Config, Ticket, User } from '@cr/interfaces';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, of, Subject } from 'rxjs';
import {
  CONFIG_INJECTION_TOKEN,
  ConfigService,
  TicketService,
  TranslationService,
} from '@cr/services';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { filter, switchMap, takeUntil } from 'rxjs/operators';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';

@Component({
  selector: 'cr-ticket',
  templateUrl: './ticket.component.html',
  styles: [`h1,h2{color:#F68954;}p{font:normal 20px/32px opensans-600,Arial,Helvetica,sans-serif;}`],
  styleUrls: ['./ticket.component.scss'],
})
export class TicketComponent implements OnDestroy, OnInit {
  @ViewChild('file') private _file: ElementRef;

  fileTypes = '.png, .jpg, .jpeg, .gif, .doc, .pdf';
  isView = false;
  ticket: Ticket;
  comments: Comment[] = [];
  formGroup: FormGroup;
  selectedFile: File;
  isPending = false;
  isMobile = false;

  private _user: User;
  private _textAreaValue = '';
  private _fileEvent: any;

  private _unsubscribe$: Subject<void> = new Subject<void>();

  constructor(
    @Inject(CONFIG_INJECTION_TOKEN) private _config: Config,
    private _route: ActivatedRoute,
    private _router: Router,
    private _formBuilder: FormBuilder,
    private _sanitizer: DomSanitizer,
    private _ticketsService: TicketService,
    private _configService: ConfigService,
    private _breakpointObserver: BreakpointObserver,
    private _translationService: TranslationService
  ) {}

  ngOnDestroy(): void {
    this._unsubscribe$.next();
    this._unsubscribe$.complete();
  }

  ngOnInit(): void {
    this._initFormGroup();
    this._handleUser();
    this._setValidators();
    this._handleBreakpoint();
  }

  uploadFile(evt: any): void {
    const file: File = evt.target.files[0];
    this._fileEvent = evt;

    if (file.size > 2097152) {
      this._fileEvent.target.value = '';

      this._configService.snackbar$.next({
        msg: this._translationService.translate(
          'lawyer.ticket.maximumAllowedFileSize'
        ),
      });
    } else {
      this._configService.snackbar$.next({
        msg: this._translationService.translate(
          'lawyer.ticket.fileSuccessfullySelected'
        ),
      });
      this.selectedFile = evt.target.files[0];
    }
  }

  cancelFileSelect(): void {
    this.selectedFile = null;

    if (this._fileEvent) {
      this._fileEvent.target.value = '';
    }
  }

  openFileDialog(): void {
    this._file.nativeElement.click();
  }

  onSubmit(): void {
    if (this.formGroup.valid) {
      let query: Observable<any>;

      this.isPending = true;
      this._textAreaValue = this.formGroup.get('questionOrComment').value;

      if (this.isView) {
        query = this._addCommentToTicket();
      } else {
        query = this._addTicket();
      }

      query
        .pipe(
          filter((res: any) => {
            if (res.status === 'ERROR') {
              this.isPending = false;
              const addCommentError = this._translationService.translate(
                'lawyer.ticket.addCommentError'
              );
              const createTicketError = this._translationService.translate(
                'lawyer.ticket.createTicketError'
              );
              this._configService.snackbar$.next({
                msg: this.isView ? addCommentError : createTicketError,
              });
            }

            return res.status === 'OK';
          }),
          takeUntil(this._unsubscribe$)
        )
        .subscribe(
          (res: any) => {
            this.formGroup.get('questionOrComment').reset('');

            if (!this.isView) {
              this._configService.snackbar$.next({
                msg: this._translationService.translate(
                  'lawyer.ticket.ticketSuccessfullyCreated'
                ),
              });
              this._router.navigate([`/user/lawyer`]);
            } else {
              this._configService.snackbar$.next({
                msg: this._translationService.translate(
                  'lawyer.ticket.commentSuccessfullyAdded'
                ),
              });

              this.comments.push({
                firstname: this.ticket.firstname,
                answer: this._textAreaValue,
                is_admin: false,
                file_link: res.file_link,
                file_name: res.file_name,
                c_date: res.c_date,
                isCommentDateToday: true,
              });

              this._textAreaValue = '';
            }

            this.isPending = false;
          },
          (err: Error) => {
            this.isPending = false;
            this._configService.snackbar$.next({
              msg: this._translationService.translate(
                'lawyer.ticket.errorOccurred'
              ),
            });
          }
        );
    } else {
      this.formGroup.markAllAsTouched();
    }
  }

  private _initFormGroup(): void {
    this.formGroup = this._formBuilder.group({
      subject: ['', { validators: null, updateOn: 'blur' }],
      questionOrComment: ['', { validators: null, updateOn: 'blur' }],
    });
  }

  private _setValidators(): void {
    this.formGroup
      .get('subject')
      .setValidators([Validators.required, Validators.maxLength(250)]);
    this.formGroup.get('subject').updateValueAndValidity();

    const questionValidators: any[] = [Validators.required];

    if (!this.isView) {
      questionValidators.push(
        Validators.minLength(100),
        Validators.maxLength(15500)
      );
    }

    this.formGroup.get('questionOrComment').setValidators(questionValidators);
    this.formGroup.get('questionOrComment').updateValueAndValidity();
  }

  private _handleUser(): void {
    this._configService.user$
      .pipe(
        filter((res) => !!res),
        switchMap((res) => {
          this._user = res;

          if (
            this._router.url.includes('view') &&
            this._route.snapshot.params.id
          ) {
            this.isView = true;

            return this._getTicketById(this._route.snapshot.params.id);
          }

          return of(null);
        }),
        filter((res) => !!res),
        takeUntil(this._unsubscribe$)
      )
      .subscribe(
        (res: any) => {
          this.ticket = res.ticket_info;
          this.comments = res.ticket_comments;
          this.formGroup.get('subject').setValue(this.ticket.subject);

          this.comments.forEach((comment) => {
            if (comment.is_admin) {
              comment.trustedHtml = this._sanitizer.bypassSecurityTrustHtml(
                comment.answer
              );
            }
          });

          if (this.ticket.status === 'closed') {
            this.formGroup.get('questionOrComment').disable();
          } else if (this.ticket.status === 'noclosed') {
            this.formGroup.get('questionOrCommentNoclosed').disable();
          } else if (this.ticket.status === 'reclosed') {
            this.formGroup.get('questionOrCommentReclosed').disable();
          } else if (this.ticket.status === 'opened') {
            this.formGroup.get('questionOrCommentOpened').disable();
          } else if (this.ticket.status === 'reopened') {
            this.formGroup.get('questionOrCommentReopened').disable();
          }
    
        },
        () => this._router.navigate(['/user/lawyer'])
      );
  }

  private _getTicketById(ticketGuid: string): Observable<any> {
    return this._ticketsService
      .getTicketById({
        ticket_guid: ticketGuid,
        token: localStorage.getItem('token'),
      })
      .pipe(
        filter((res) => {
          if (res.status !== 'OK') {
            this._configService.snackbar$.next({
              msg: this._translationService.translate(
                'lawyer.ticket.ticketDoesNotExist'
              ),
            });
            this._router.navigate(['/user/lawyer']);
          }

          return res.status === 'OK';
        })
      );
  }

  private _addTicket(): Observable<{
    status: 'OK' | 'ERROR';
    ticket_guid: string;
  }> {
    const formData = new FormData();
    const formValue = this.formGroup.value;

    formData.append('subject', formValue.subject);
    formData.append('firstname', this._user.FIRSTNAME);
    formData.append('email', this._user.EMAIL);
    formData.append('question', this.formGroup.value.questionOrComment);
    formData.append('user_id', this._user.ID);
    formData.append('domain', this._config.domainForLawyer);
    formData.append('token', localStorage.getItem('token'));

    if (this.selectedFile) {
      formData.append('attach', this.selectedFile, this.selectedFile.name);
    }

    return this._ticketsService.addTicket(formData);
  }

  private _addCommentToTicket(): Observable<AddComment> {
    const formData = new FormData();

    formData.append('ticket_guid', this.ticket.guid);
    formData.append('firstname', this.ticket.firstname);
    formData.append('answer', this.formGroup.value.questionOrComment);
    formData.append('is_admin', '0');
    formData.append('token', localStorage.getItem('token'));

    if (this.selectedFile) {
      formData.append('attach', this.selectedFile, this.selectedFile.name);
    }

    return this._ticketsService.addCommentToTicket(formData);
  }

  private _handleBreakpoint(): void {
    this._breakpointObserver
      .observe(['(max-width: 767px)'])
      .pipe(takeUntil(this._unsubscribe$))
      .subscribe((state: BreakpointState) => (this.isMobile = state.matches));
  }
}
