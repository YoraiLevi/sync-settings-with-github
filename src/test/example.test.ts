import * as sinon from 'sinon';

describe('context variable', function () {
    let obj: { level: number };
    before(function () {
        console.log('before');
        obj = { level: 0 };
    });
    beforeEach(function () {
        console.log('beforeEach');
    });
    afterEach(function () {
        console.log('afterEach');
    });
    after(function () {
        console.log('after');
    });
    it('Should pass', async function () {
        expect(true).to.be.true;
    });
    it('should be level 0', function () {
        expect(obj.level).to.equal(0);
    });
    it('expect to not throw', function () {
        assert(() => {
            // throw new Error('test');
        });
        should.not.Throw(() => {
            // throw new Error('test');
        });
        expect(() => {
            // throw new Error('test');
        }).to.not.throw();
    });
    it('should not throw', function () {
        (() => {
            // throw new Error('test');
        }).should.not.throw();
        (() => {
            // throw new Error('test');
        }).should.not.throw();
        // should.not.Throw(() => {
        //     // throw new Error('test');
        // });
    });
    describe('level 1', function () {
        let obj: { level: number };
        before(function () {
            obj = { level: 1 };
            // obj.level = 1;
        });
        it('should be level 1', function () {
            expect(obj.level).to.equal(1);
        });
    });
    it('should be level 0 again', function () {
        expect(obj.level).to.equal(0);
    });
    it("should call callback with correct greeting", function () {
        function hello(name: string, cb: (greeting: string) => void) {
            cb("hello " + name);
        }
        var cb = sinon.spy();

        hello("foo", cb);

        cb.should.have.been.calledWith("hello foo");
    });
    after(function () {
        console.log('afterLevel', obj.level);
    });
});
