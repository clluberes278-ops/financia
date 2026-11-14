namespace Financia.Api.Realtime;

public sealed class FinanceOutboxWorker(IServiceScopeFactory scopes, ILogger<FinanceOutboxWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<FinanceOutboxPublisher>().PublishPendingAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                // Do not log payloads, tokens, owners or provider exception text (which may contain connection details).
                logger.LogWarning("Finance notification delivery failed ({FailureType}); pending events will be retried.", error.GetType().Name);
            }
            try { await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
        }
    }
}
