import { shopAddressParts } from './shop-address';

describe('shopAddressParts (invoice / receipt address)', () => {
  const full = { shopAddress: 'Thana Road, Patepur Bazaar', shopDistrict: 'Vaishali', shopState: 'Bihar', shopPinCode: '843114' };

  it('builds the place line and one-line address from the Settings fields', () => {
    const a = shopAddressParts(full);
    expect(a.street).toBe('Thana Road, Patepur Bazaar');
    expect(a.placeLine).toBe('Dist. Vaishali, Bihar - 843114');
    expect(a.oneLine).toBe('Thana Road, Patepur Bazaar, Dist. Vaishali, Bihar - 843114');
    expect(a.state).toBe('Bihar');
  });

  it('leaves out whatever is not filled in', () => {
    expect(shopAddressParts({ shopAddress: 'Main Road', shopState: 'Bihar' }).oneLine).toBe('Main Road, Bihar');
    expect(shopAddressParts({ shopPinCode: '843114' }).placeLine).toBe('Bihar - 843114');
    expect(shopAddressParts({ shopDistrict: 'Vaishali' }).placeLine).toBe('Dist. Vaishali, Bihar');
  });

  it('defaults the state to Bihar, and still reads the older stateName setting', () => {
    expect(shopAddressParts({}).state).toBe('Bihar');
    expect(shopAddressParts({ stateName: 'Maharashtra' }).state).toBe('Maharashtra');
    expect(shopAddressParts({ stateName: 'Maharashtra', shopState: 'Bihar' }).state).toBe('Bihar');
  });

  it('ignores stray spaces', () => {
    expect(shopAddressParts({ shopAddress: '  Main Road ', shopDistrict: ' ', shopState: ' Bihar ', shopPinCode: ' 843114 ' }).oneLine)
      .toBe('Main Road, Bihar - 843114');
  });
});
