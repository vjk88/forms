@IsTest
private class FinalMappingSoqlTest {
    private static String problemOf(String clause) {
        return FinalMappingSoql.parse(clause).problem;
    }

    @IsTest
    static void blankAsksForTheSearch() {
        Assert.areEqual(
            'Write the conditions, or go back to the Conditions tab.',
            problemOf('   ')
        );
        Assert.areEqual(
            'Write the conditions, or go back to the Conditions tab.',
            problemOf(null)
        );
    }

    @IsTest
    static void tooLongIsRefused() {
        Assert.areEqual(
            'Keep the conditions under 4,000 characters.',
            problemOf('Title = \'' + 'x'.repeat(4000) + '\'')
        );
    }

    @IsTest
    static void semicolonIsRefused() {
        Assert.isTrue(problemOf('Title = \'a\'; DELETE').contains('semicolon'));
    }

    @IsTest
    static void dollarIsRefused() {
        Assert.isTrue(problemOf('OwnerId = $User.Id').contains('$User'));
    }

    @IsTest
    static void bindColonsAreRefusedButDateLiteralsPass() {
        Assert.areEqual(
            'Use Insert answer instead of a : value.',
            problemOf('Title = :x')
        );
        Assert.areEqual(
            'Use Insert answer instead of a : value.',
            problemOf('Title = : x')
        );
        Assert.areEqual(
            'Use Insert answer instead of a : value.',
            problemOf('Title IN :(x)')
        );
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            'CreatedDate = LAST_N_DAYS:30'
        );
        Assert.isNull(p.problem);
        Assert.areEqual('CreatedDate = LAST_N_DAYS:30', p.whereClause);
    }

    @IsTest
    static void bannedWordsAreRefusedInAnyCaseAsTyped() {
        Assert.areEqual(
            'limit can’t be used here — this box takes only the conditions after WHERE.',
            problemOf('Title = \'a\' limit 5')
        );
        Assert.isTrue(
            problemOf('Id IN (SeLeCt ContactId FROM Case)').startsWith('SeLeCt')
        );
        // part of a longer name is not the word
        Assert.isNull(problemOf('From_Date__c = TODAY'));
    }

    @IsTest
    static void quotedTextIsNeverRead() {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            'Title = \'SELECT one; $x :y {!el_a}\''
        );
        Assert.isNull(p.problem);
        Assert.areEqual(0, p.tokens.size());
        Assert.areEqual('Title = \'SELECT one; $x :y {!el_a}\'', p.whereClause);
    }

    @IsTest
    static void escapedQuotesStayInsideTheValue() {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            'LastName = \'O\\\'Brien\' AND Email = {!el_e}'
        );
        Assert.isNull(p.problem);
        Assert.areEqual(1, p.tokens.size());
    }

    @IsTest
    static void tokensBecomeBindsWithTheirFieldAndComparison() {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse(
            'Email = {!el_e} AND (Account.Type != {!el_t} OR Name LIKE {!el_n})'
        );
        Assert.isNull(p.problem);
        Assert.areEqual(
            'Email = :m0 AND (Account.Type != :m1 OR Name LIKE :m2)',
            p.whereClause
        );
        Assert.areEqual(3, p.tokens.size());
        Assert.areEqual('el_e', p.tokens[0].elementId);
        Assert.areEqual('Email', p.tokens[0].fieldPath);
        Assert.areEqual('=', p.tokens[0].operator);
        Assert.areEqual('m0', p.tokens[0].bindName);
        Assert.areEqual('Account.Type', p.tokens[1].fieldPath);
        Assert.areEqual('!=', p.tokens[1].operator);
        Assert.areEqual('m1', p.tokens[1].bindName);
        Assert.areEqual('Name', p.tokens[2].fieldPath);
        Assert.areEqual('LIKE', p.tokens[2].operator);
    }

    @IsTest
    static void likeIsReadInAnyCase() {
        FinalMappingSoql.Parsed p = FinalMappingSoql.parse('Name like {!el_n}');
        Assert.areEqual('LIKE', p.tokens[0].operator);
    }

    @IsTest
    static void aTokenMustFollowAFieldAndAComparison() {
        String placement = 'Put each answer right after a field and a comparison, like Email = {Your email}.';
        Assert.areEqual(placement, problemOf('{!el_e} = Email'));
        Assert.areEqual(placement, problemOf('Email IN ({!el_e})'));
        Assert.areEqual(placement, problemOf('Email = \'a\' AND {!el_e}'));
    }

    @IsTest
    static void otherBracesNameTheMissingQuestion() {
        Assert.areEqual(
            'There’s no question called "Your email". Use Insert answer.',
            problemOf('Email = {Your email}')
        );
        Assert.isTrue(
            problemOf('Email = x}').startsWith('There’s no question')
        );
    }

    @IsTest
    static void unclosedQuoteIsRefused() {
        Assert.areEqual(
            'A quoted value isn’t closed.',
            problemOf('Title = \'abc')
        );
    }

    @IsTest
    static void unbalancedBracketsAreRefused() {
        Assert.areEqual(
            'The brackets don’t match.',
            problemOf('(Title = \'a\'')
        );
        Assert.areEqual(
            'The brackets don’t match.',
            problemOf('Title = \'a\') AND (Name = \'b\'')
        );
        Assert.isNull(problemOf('Title = \'(\''));
    }

    @IsTest
    static void escapeLikeMatchesAsTyped() {
        Assert.areEqual('50\\%', FinalMappingSoql.escapeLike('50%'));
        Assert.areEqual('a\\_b', FinalMappingSoql.escapeLike('a_b'));
        Assert.areEqual('c:\\\\x', FinalMappingSoql.escapeLike('c:\\x'));
        Assert.isNull(FinalMappingSoql.escapeLike(null));
    }
}
