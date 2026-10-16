alter table public.bank_email_transactions
  drop constraint if exists bank_email_transactions_bank_check,
  drop constraint if exists bank_email_transactions_currency_check;

alter table public.bank_email_transactions
  add constraint bank_email_transactions_bank_check
    check (length(trim(bank)) > 0),
  add constraint bank_email_transactions_currency_check
    check (currency in ('DOP', 'USD'));
