@IsTest
private class FinalSpecStoreTest {
    private static String ofLength(Integer n) {
        // Distinct characters per position so a mis-ordered join is caught.
        String alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        Integer reps = (n / alphabet.length()) + 1;
        return alphabet.repeat(reps).substring(0, n);
    }

    private static Form_Version__c roundTrip(String json) {
        Form__c f = new Form__c(
            Name = 'Spec store',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = false,
            Engine_Version__c = 1
        );
        FinalSpecStore.write(v, json);
        insert v;
        return [
            SELECT Id, Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c
            FROM Form_Version__c
            WHERE Id = :v.Id
        ];
    }

    @IsTest
    static void roundTripsEveryBoundaryLength() {
        List<Integer> lengths = new List<Integer>{
            1,
            FinalSpecStore.PART - 1,
            FinalSpecStore.PART,
            FinalSpecStore.PART + 1,
            2 * FinalSpecStore.PART + 5,
            FinalSpecStore.MAX
        };
        for (Integer n : lengths) {
            String json = ofLength(n);
            Form_Version__c back = roundTrip(json);
            Assert.areEqual(json, FinalSpecStore.read(back), 'length ' + n);
        }
    }

    @IsTest
    static void blankWritesNullAllParts() {
        for (String blank : new List<String>{ null, '', '   ' }) {
            Form_Version__c v = new Form_Version__c(
                Spec_JSON__c = 'x',
                Spec_JSON_2__c = 'y',
                Spec_JSON_3__c = 'z'
            );
            FinalSpecStore.write(v, blank);
            Assert.isNull(v.Spec_JSON__c);
            Assert.isNull(v.Spec_JSON_2__c);
            Assert.isNull(v.Spec_JSON_3__c);
            Assert.isNull(FinalSpecStore.read(v), 'all null reads null');
        }
        Assert.isNull(FinalSpecStore.read(null));
    }

    @IsTest
    static void splitsAtPartBoundaries() {
        Form_Version__c v = new Form_Version__c();
        FinalSpecStore.write(v, ofLength(FinalSpecStore.PART));
        Assert.areEqual(FinalSpecStore.PART, v.Spec_JSON__c.length());
        Assert.isNull(v.Spec_JSON_2__c, 'exactly PART needs one field');
        Assert.isNull(v.Spec_JSON_3__c);

        FinalSpecStore.write(v, ofLength(FinalSpecStore.PART + 1));
        Assert.areEqual(FinalSpecStore.PART, v.Spec_JSON__c.length());
        Assert.areEqual(1, v.Spec_JSON_2__c.length());
        Assert.isNull(v.Spec_JSON_3__c);

        FinalSpecStore.write(v, ofLength(2 * FinalSpecStore.PART + 5));
        Assert.areEqual(FinalSpecStore.PART, v.Spec_JSON_2__c.length());
        Assert.areEqual(5, v.Spec_JSON_3__c.length());
    }

    @IsTest
    static void overTheLimitThrowsWithTheFriendlyMessage() {
        Form_Version__c v = new Form_Version__c(Spec_JSON__c = 'keep');
        Integer n = FinalSpecStore.MAX + 1;
        try {
            FinalSpecStore.write(v, ofLength(n));
            Assert.fail('should throw');
        } catch (FinalSpecStore.TooLargeException e) {
            Assert.areEqual(
                'This form is too large to save (' +
                    n.format() +
                    ' characters; the limit is ' +
                    FinalSpecStore.MAX.format() +
                    '). Remove some questions or split it into two forms.',
                e.getMessage()
            );
        }
        Assert.areEqual(
            'keep',
            v.Spec_JSON__c,
            'a refused write changes nothing'
        );
    }

    @IsTest
    static void shrinkingASpecClearsTheOldParts() {
        Form_Version__c big = roundTrip(ofLength(2 * FinalSpecStore.PART + 5));
        Assert.isNotNull(big.Spec_JSON_2__c);
        Assert.isNotNull(big.Spec_JSON_3__c);

        FinalSpecStore.write(big, '{"small":true}');
        update big;
        Form_Version__c back = [
            SELECT Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c
            FROM Form_Version__c
            WHERE Id = :big.Id
        ];
        Assert.areEqual('{"small":true}', back.Spec_JSON__c);
        Assert.isNull(back.Spec_JSON_2__c, 'part 2 cleared');
        Assert.isNull(back.Spec_JSON_3__c, 'part 3 cleared');
        Assert.areEqual('{"small":true}', FinalSpecStore.read(back));
    }

    @IsTest
    static void aReaderThatForgotTheContinuationFieldsFailsLoudly() {
        Form_Version__c big = roundTrip(ofLength(2 * FinalSpecStore.PART + 5));
        Form_Version__c partial = [
            SELECT Id, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :big.Id
        ];
        try {
            FinalSpecStore.read(partial);
            Assert.fail('should throw');
        } catch (FinalSpecStore.NotQueriedException e) {
            Assert.isTrue(
                e.getMessage().contains('must be queried with Spec_JSON__c')
            );
        }

        // part 2 queried, part 3 not, and part 2 is full
        Form_Version__c noThree = [
            SELECT Id, Spec_JSON__c, Spec_JSON_2__c
            FROM Form_Version__c
            WHERE Id = :big.Id
        ];
        try {
            FinalSpecStore.read(noThree);
            Assert.fail('should throw');
        } catch (FinalSpecStore.NotQueriedException e) {
            Assert.isNotNull(e.getMessage());
        }

        // a short spec never needs the continuation fields
        Form_Version__c small = roundTrip('{"a":1}');
        Form_Version__c smallPartial = [
            SELECT Id, Spec_JSON__c
            FROM Form_Version__c
            WHERE Id = :small.Id
        ];
        Assert.areEqual('{"a":1}', FinalSpecStore.read(smallPartial));
    }

    @IsTest
    static void anEmojiOnThePartBoundaryIsNeverSplit() {
        // PART - 1 plain characters, then a 2-unit emoji straddling the cut
        String emoji = '😀';
        String json = ofLength(FinalSpecStore.PART - 1) + emoji + 'tail';
        Form_Version__c v = roundTrip(json);
        Assert.areEqual(FinalSpecStore.PART - 1, v.Spec_JSON__c.length());
        Assert.isTrue(v.Spec_JSON_2__c.startsWith(emoji), 'pair kept whole');
        Assert.areEqual(json, FinalSpecStore.read(v));
    }

    @IsTest
    static void fieldListNamesAllThreeParts() {
        Assert.areEqual(
            'Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c',
            FinalSpecStore.FIELDS
        );
    }
}
