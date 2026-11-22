/**
 * FinalAddressGuestGuard - the spend caps for address search by GUESTS.
 *
 * A guest search reaches a paid provider, so two ceilings apply (IMPL_PLAN_
 * ADDRESS_INPUT.md, "Guest caps"):
 *  - per ticket: 30 suggest calls and 5 details calls (the keys carry a hash of
 *    the ticket, never the ticket itself);
 *  - org-wide: 3,000 guest address calls (suggest + details) per clock hour.
 *
 * Counters live in the Org cache partition `local.FinalGuest`. spend() reads
 * the counter, checks it, then writes it back. That is NOT atomic: two calls at
 * the same instant can both pass, so a cap can be overshot by a few calls. That
 * is accepted; these are cost ceilings, not exact quotas.
 *
 * FAIL CLOSED: unlike FinalGuestTicket's replay marker (which fails open), a
 * missing partition or any cache error answers LIMIT. A cap that is not
 * enforced spends the customer's money, and the respondent can always type the
 * address instead.
 */
public inherited sharing class FinalAddressGuestGuard {
    public static final Integer MAX_SUGGESTS = 30;
    public static final Integer MAX_DETAILS = 5;
    public static final Integer MAX_PER_HOUR = 3000;

    private static final String PARTITION = 'local.FinalGuest';
    private static final Integer TICKET_TTL_SECS = 7200;
    private static final Integer HOUR_TTL_SECS = 3600;

    // ----- test seams (no Test.isRunningTest() anywhere) -----

    /** True simulates the cache being unavailable (fails closed). */
    @TestVisible
    private static Boolean cacheUnavailable = false;
    /** When non-null, an in-memory stand-in for the Org cache. */
    @TestVisible
    private static Map<String, Integer> memoryCache;
    /** When set, replace the per-ticket suggest cap. */
    @TestVisible
    private static Integer suggestCapOverride;
    /** When set, replace the per-ticket details cap. */
    @TestVisible
    private static Integer detailsCapOverride;
    /** When set, replace the org-wide hourly cap. */
    @TestVisible
    private static Integer hourCapOverride;
    /** When set, the clock the hour key reads. */
    @TestVisible
    private static Datetime nowOverride;

    /** Count one guest address call; throws AddressException(LIMIT) when a cap
     *  is reached or the cache cannot be trusted. Call it only when a provider
     *  call will actually follow. */
    public static void spend(String ticket, Boolean isDetails) {
        if (String.isBlank(ticket)) {
            throw limitReached();
        }
        Boolean details = isDetails == true;
        String ticketKey = ticketKey(ticket, details);
        String hourKey = hourKey();
        Integer ticketCap = details ? detailsCap() : suggestCap();
        try {
            if (cacheUnavailable == true) {
                throw limitReached();
            }
            Cache.OrgPartition part = null;
            if (memoryCache == null) {
                part = Cache.Org.getPartition(PARTITION);
                if (part == null) {
                    throw limitReached();
                }
            }
            Integer perTicket = read(part, ticketKey);
            Integer perHour = read(part, hourKey);
            if (perTicket >= ticketCap || perHour >= hourCap()) {
                throw limitReached();
            }
            write(part, ticketKey, perTicket + 1, TICKET_TTL_SECS);
            write(part, hourKey, perHour + 1, HOUR_TTL_SECS);
        } catch (FinalAddressService.AddressException e) {
            throw e;
        } catch (Exception e) {
            // no partition, no capacity, any cache error: fail closed
            throw limitReached();
        }
    }

    // ------------------------------------------------------------ helpers

    private static Integer read(Cache.OrgPartition part, String key) {
        Object v = null;
        if (memoryCache != null) {
            v = memoryCache.get(key);
        } else {
            v = part.get(key);
        }
        return v instanceof Integer ? (Integer) v : 0;
    }

    private static void write(
        Cache.OrgPartition part,
        String key,
        Integer value,
        Integer ttl
    ) {
        if (memoryCache != null) {
            memoryCache.put(key, value);
        } else {
            part.put(key, value, ttl);
        }
    }

    /** 'addr' + first 32 hex chars of SHA-256(ticket) + 's' | 'd'. */
    @TestVisible
    private static String ticketKey(String ticket, Boolean isDetails) {
        String hex = EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(ticket))
        );
        return 'addr' + hex.substring(0, 32) + (isDetails ? 'd' : 's');
    }

    /** 'addrhr' + yyyyMMddHH in GMT. */
    @TestVisible
    private static String hourKey() {
        Datetime n = nowOverride != null ? nowOverride : Datetime.now();
        return 'addrhr' + n.formatGmt('yyyyMMddHH');
    }

    private static Integer suggestCap() {
        return suggestCapOverride != null ? suggestCapOverride : MAX_SUGGESTS;
    }

    private static Integer detailsCap() {
        return detailsCapOverride != null ? detailsCapOverride : MAX_DETAILS;
    }

    private static Integer hourCap() {
        return hourCapOverride != null ? hourCapOverride : MAX_PER_HOUR;
    }

    private static FinalAddressService.AddressException limitReached() {
        return new FinalAddressService.AddressException(
            FinalAddressService.LIMIT_REACHED
        );
    }
}
