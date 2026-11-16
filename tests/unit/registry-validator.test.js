const { LocalRegistryValidator } = require('../../src/services/registry-validator');

describe('LocalRegistryValidator', () => {
  it('considera regular um documento fora da lista de restrições', async () => {
    const validator = new LocalRegistryValidator();

    await expect(validator.validate('52998224725')).resolves.toEqual({
      document: '52998224725',
      status: 'REGULAR',
    });
  });

  it('considera irregular um documento presente na lista de restrições', async () => {
    const validator = new LocalRegistryValidator({ irregularDocuments: ['11144477735'] });

    await expect(validator.validate('11144477735')).resolves.toEqual({
      document: '11144477735',
      status: 'IRREGULAR',
    });
  });

  it('compara documentos ignorando a pontuação', async () => {
    const validator = new LocalRegistryValidator({ irregularDocuments: ['111.444.777-35'] });

    const result = await validator.validate('11144477735');

    expect(result.status).toBe('IRREGULAR');
  });
});
