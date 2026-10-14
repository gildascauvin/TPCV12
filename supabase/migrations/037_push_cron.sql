-- Passage horaire des notifications (2026-10-14) : pg_cron + pg_net (gratuits sur Supabase)
-- remplacent les 2 crons quotidiens Vercel. Le secret vit dans le coffre (vault, 'push_cron_secret'),
-- même valeur que la variable Vercel PUSH_CRON_SECRET. À la minute 5 de chaque heure.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- select vault.create_secret('<secret>', 'push_cron_secret', 'Bearer pour /api/push/send (pg_cron)');
select cron.schedule('push-hourly', '5 * * * *', $$
  select net.http_get(
    url := 'https://go.theperfclub.com/api/push/send',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    timeout_milliseconds := 60000
  );
$$);
