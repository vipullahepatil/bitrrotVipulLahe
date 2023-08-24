
import request from 'supertest';
import app from '../app'; 

describe('Contacts API', () => {
  it('should create a new contact', async () => {
    const res = await request(app)
      .post('/contacts')
      .send({
        name: 'VipulLahe',
        email: 'vipullahepatil@gmail.com',
        phoneNumbers: ['5208']
      });

    expect(res.status).toEqual(200);
    expect(res.body.message).toEqual('Contact created successfully');
  });

  // Add more integration tests for other endpoints and scenarios
});
