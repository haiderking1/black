# Model catalog cache

The composer saves each provider's model IDs and thinking metadata in local storage. It reads them synchronously on startup, before RPC connects, then refreshes in the background. Only the first launch without a usable cache needs a loading state.

Refresh failures keep the last successful catalog visible and report the error in the model picker. Successful refreshes replace the list, including removed models and explicitly unknown capabilities. When only the limits catalog is unavailable and capability fields are omitted, existing models keep their last-known thinking metadata. Backend effort validation still applies to every request.

Changing credentials or provider enabled state clears that provider's cache. Cached data contains no credentials. Invalid or unsupported cache versions are ignored, and unavailable storage does not prevent an in-memory cache.
