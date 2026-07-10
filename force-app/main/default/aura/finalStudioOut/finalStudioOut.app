<aura:application access="GLOBAL" extends="ltng:outApp">
    <!-- Lightning Out dependency app for the FinalStudio Visualforce host.
         ltng:outApp (not ltng:outAppUnstyled) so SLDS ships for the
         lightning-* base components inside the studio. -->
    <aura:dependency resource="c:finalFormStudio" />
</aura:application>
