/** The guest address spend caps (FinalAddressGuestGuard), driven through its
 *  in-memory stand-in for the Org cache. */
@IsTest
private class FinalAddressGuestGuardTest {
    private static void fresh() {
        FinalAddressGuestGuard.memoryCache = new Map<String, Integer>();
        FinalAddressGuestGuard.cacheUnavailable = false;
        FinalAddressGuestGuard.suggestCapOverride = null;
        FinalAddressGuestGuard.detailsCapOverride = null;
        FinalAddressGuestGuard.hourCapOverride = null;
        FinalAddressGuestGuard.nowOverride = Datetime.newInstanceGmt(
            2026,
            11,
            22,
            14,
            30,
            0
        );
    }

    private static Boolean limited(String ticket, Boolean isDetails) {
        try {
            FinalAddressGuestGuard.spend(ticket, isDetails);
            return false;
        } catch (FinalAddressService.AddressException e) {
            Assert.areEqual(FinalAddressService.LIMIT_REACHED, e.getMessage());
            return true;
        }
    }

    @IsTest
    static void keysHaveTheDocumentedShape() {
        fresh();
        String sKey = FinalAddressGuestGuard.ticketKey('abc', false);
        String dKey = FinalAddressGuestGuard.ticketKey('abc', true);
        Assert.areEqual(4 + 32 + 1, sKey.length());
        Assert.isTrue(sKey.startsWith('addr'));
        Assert.isTrue(sKey.endsWith('s'));
        Assert.isTrue(dKey.endsWith('d'));
        Assert.areEqual(
            sKey.substring(0, sKey.length() - 1),
            dKey.substring(0, dKey.length() - 1)
        );
        Assert.areEqual('addrhr2026112214', FinalAddressGuestGuard.hourKey());
    }

    @IsTest
    static void suggestsStopAtTheCap() {
        fresh();
        for (Integer i = 0; i < FinalAddressGuestGuard.MAX_SUGGESTS; i++) {
            Assert.isFalse(limited('t1', false), 'call ' + i);
        }
        Assert.isTrue(limited('t1', false));
        // another ticket still has its own allowance
        Assert.isFalse(limited('t2', false));
    }

    @IsTest
    static void detailsStopAtTheirOwnCap() {
        fresh();
        for (Integer i = 0; i < FinalAddressGuestGuard.MAX_DETAILS; i++) {
            Assert.isFalse(limited('t1', true), 'call ' + i);
        }
        Assert.isTrue(limited('t1', true));
        Assert.isFalse(limited('t1', false));
    }

    @IsTest
    static void orgWideHourCapStopsEveryone() {
        fresh();
        FinalAddressGuestGuard.hourCapOverride = 3;
        Assert.isFalse(limited('a', false));
        Assert.isFalse(limited('b', false));
        Assert.isFalse(limited('c', true));
        Assert.isTrue(limited('d', false));
    }

    @IsTest
    static void aNewHourStartsANewCount() {
        fresh();
        FinalAddressGuestGuard.hourCapOverride = 1;
        Assert.isFalse(limited('a', false));
        Assert.isTrue(limited('b', false));
        FinalAddressGuestGuard.nowOverride = Datetime.newInstanceGmt(
            2026,
            11,
            22,
            15,
            0,
            1
        );
        Assert.isFalse(limited('b', false));
    }

    @IsTest
    static void failsClosedWhenTheCacheIsUnavailable() {
        fresh();
        FinalAddressGuestGuard.cacheUnavailable = true;
        Assert.isTrue(limited('a', false));
        Assert.isTrue(limited('a', true));
    }

    @IsTest
    static void aBlankTicketIsLimited() {
        fresh();
        Assert.isTrue(limited(null, false));
        Assert.isTrue(limited('', true));
    }

    @IsTest
    static void realPartitionPathNeverLetsACallThroughUncounted() {
        fresh();
        // No in-memory stand-in: the real partition path. With the cap at 0 the
        // answer is LIMIT whether the partition exists (counter 0 >= cap 0) or
        // is missing / errors (fail closed).
        FinalAddressGuestGuard.memoryCache = null;
        FinalAddressGuestGuard.suggestCapOverride = 0;
        Assert.isTrue(limited('a', false));
    }
}
