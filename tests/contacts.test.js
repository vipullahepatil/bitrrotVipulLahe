// tests/contacts.test.js
import { use, expect as _expect, request } from 'chai';
import chaiHttp from 'chai-http';
import app from '../app'; 

use(chaiHttp);
const expect = _expect;

describe('Contacts API', () => {
  it('should create a new contact', async () => {
    const res = await request(app)
      .post('/contacts')
      .send({
        name: 'Vipul Lahe',
        email: 'vipullahe@gmail.com',
        phoneNumbers: ['7030865856']
      });

    expect(res).to.have.status(200);
    expect(res.body.message).to.equal('Contact created successfully');
  });

  
});
