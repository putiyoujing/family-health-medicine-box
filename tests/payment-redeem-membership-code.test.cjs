const assert = require('node:assert/strict')
const test = require('node:test')

const { createPaymentFixture } = require('./helpers/payment-fixture.cjs')

test('membership code redemption activates the family and cannot be redeemed twice', async () => {
  let store = {
    coupon_code_batches: [{ _id: 'batch-1', status: 'active', usedQuantity: 0 }],
    coupon_codes: [
      {
        _id: 'code-1',
        code: 'FAMILY2026',
        status: 'active',
        batchId: 'batch-1',
        externalOrderId: 'xhs-order-1',
      },
    ],
    coupon_redemptions: [],
    coupons: [{ _id: 'coupon-1', status: 'active', usedQuantity: 0 }],
    families: [{ _id: 'family-1' }],
    family_roles: [{ _id: 'role-1', familyId: 'family-1', openid: 'owner-1', role: 'owner' }],
    subscriptions: [],
  }
  const fixture = createPaymentFixture({ store })
  const paymentApi = fixture.api

  const result = await paymentApi.main({
    action: 'redeemMembershipCode',
    payload: { familyId: 'family-1', code: 'family2026' },
  })

  store = fixture.store
  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'active')
  assert.equal(store.subscriptions.length, 1)
  assert.equal(store.subscriptions[0].externalOrderId, 'xhs-order-1')
  assert.equal(store.coupon_codes[0].status, 'used')
  assert.equal(store.coupon_redemptions.length, 1)
  assert.equal('couponId' in store.coupon_redemptions[0], false)
  assert.equal(store.coupons[0].usedQuantity, 0)
  assert.equal(store.coupon_code_batches[0].usedQuantity, 1)
  assert.equal(store.families[0].plan, 'pro')

  const duplicate = await paymentApi.main({
    action: 'redeemMembershipCode',
    payload: { familyId: 'family-1', code: 'FAMILY2026' },
  })
  assert.equal(duplicate.ok, false)
  assert.equal(store.subscriptions.length, 1)
  assert.equal(store.coupon_redemptions.length, 1)
})
