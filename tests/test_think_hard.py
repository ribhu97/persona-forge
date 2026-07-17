"""
Unit tests for Think Hard mode: quota, jobs, validators.

These tests use an in-memory SQLite database and do NOT call any AI providers.
They validate the state machine, quota lifecycle, and stage validators.
"""
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from src import quota, jobs
from src.think_hard import _validate_personas, _validate_judge, _validate_critique, _classify_error
from src.generator import InvalidOutputError, SafetyBlockError, UnsupportedAttachmentError
from src.exceptions import AllProvidersRateLimitedError
from src.models import Message, Conversation, User


@pytest.fixture(name="test_engine")
def test_engine_fixture():
    """Create a fresh in-memory engine for each test."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    original_engine = jobs.engine
    original_quota_engine = quota.engine
    jobs.engine = engine
    quota.engine = engine
    yield engine
    jobs.engine = original_engine
    quota.engine = original_quota_engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="test_user")
def test_user_fixture(test_engine):
    """Create a test user and conversation."""
    with Session(test_engine) as session:
        user = User(email="test@example.com", account_type=1, is_verified=True)
        session.add(user)
        session.flush()
        conv = Conversation(user_id=user.id, title="Test")
        session.add(conv)
        session.commit()
        session.refresh(user)
        session.refresh(conv)
        return user, conv


class TestQuota:
    def test_reserve_and_commit(self, test_engine, test_user):
        user, _ = test_user
        res = quota.reserve(user.id, feature="think_hard", account_type=1)
        assert res.state == "reserved"
        assert quota.commit(res.id, message_id=1) is True

    def test_reserve_tier_required(self, test_engine, test_user):
        user, _ = test_user
        with pytest.raises(quota.TierRequired):
            quota.reserve(user.id, feature="think_hard", account_type=0)

    def test_refund_idempotent(self, test_engine, test_user):
        user, _ = test_user
        res = quota.reserve(user.id, feature="quick", account_type=1)
        assert quota.refund(res.id) is True
        assert quota.refund(res.id) is True

    def test_commit_after_refund_fails(self, test_engine, test_user):
        user, _ = test_user
        res = quota.reserve(user.id, feature="quick", account_type=1)
        quota.refund(res.id)
        assert quota.commit(res.id, message_id=1) is False


class TestJobs:
    def test_create_job(self, test_engine, test_user):
        user, conv = test_user
        job = jobs.create_job(
            user_id=user.id, conversation_id=conv.id,
            mode="think_hard", input_text="A meal planning app", account_type=1,
        )
        assert job.state == jobs.STATE_QUEUED
        assert job.mode == "think_hard"
        with Session(test_engine) as session:
            asst_msg = session.get(Message, job.assistant_message_id)
            assert asst_msg.is_pending is True

    def test_create_job_tier_required(self, test_engine, test_user):
        user, conv = test_user
        with pytest.raises(quota.TierRequired):
            jobs.create_job(user_id=user.id, conversation_id=conv.id,
                            mode="think_hard", input_text="test", account_type=0)

    def test_claim_next_queued(self, test_engine, test_user):
        user, conv = test_user
        job = jobs.create_job(user_id=user.id, conversation_id=conv.id,
                              mode="quick", input_text="test", account_type=1)
        claimed = jobs.claim_next_queued("worker-1")
        assert claimed is not None
        assert claimed.id == job.id
        assert claimed.state == jobs.STATE_RUNNING
        assert jobs.claim_next_queued("worker-2") is None

    def test_transition_cas(self, test_engine, test_user):
        user, conv = test_user
        job = jobs.create_job(user_id=user.id, conversation_id=conv.id,
                              mode="quick", input_text="test", account_type=1)
        jobs.claim_next_queued("worker-1")
        assert jobs.transition(job.id, jobs.STATE_SUCCEEDED) is True
        assert jobs.transition(job.id, jobs.STATE_FAILED) is False

    def test_fail_job(self, test_engine, test_user):
        user, conv = test_user
        job = jobs.create_job(user_id=user.id, conversation_id=conv.id,
                              mode="quick", input_text="test", account_type=1)
        jobs.claim_next_queued("worker-1")
        assert jobs.fail_job(job.id, jobs.ERR_INVALID_OUTPUT, "bad") is True
        updated = jobs.get_job(job.id)
        assert updated.state == jobs.STATE_FAILED
        assert updated.error_code == jobs.ERR_INVALID_OUTPUT

    def test_idempotency_dedup(self, test_engine, test_user):
        user, conv = test_user
        job1 = jobs.create_job(user_id=user.id, conversation_id=conv.id,
                               mode="quick", input_text="test",
                               idempotency_key="abc", account_type=1)
        job2 = jobs.create_job(user_id=user.id, conversation_id=conv.id,
                               mode="quick", input_text="test",
                               idempotency_key="abc", account_type=1)
        assert job1.id == job2.id


class TestValidators:
    def test_validate_personas_valid(self):
        d = {"personas": [{"name": "A", "status": "primary", "role": "P",
                           "tech_comfort": "high", "demographics": {"age": "30"}}]}
        assert _validate_personas(d) == d

    def test_validate_personas_missing(self):
        with pytest.raises(InvalidOutputError):
            _validate_personas({})

    def test_validate_personas_empty(self):
        with pytest.raises(InvalidOutputError):
            _validate_personas({"personas": []})

    def test_validate_personas_bad_status(self):
        with pytest.raises(InvalidOutputError):
            _validate_personas({"personas": [{"name": "A", "status": "bad",
                         "role": "r", "tech_comfort": "high", "demographics": {}}]})

    def test_validate_judge_valid(self):
        assert _validate_judge({"winner_index": 0}, 3) == {"winner_index": 0}

    def test_validate_judge_out_of_range(self):
        with pytest.raises(InvalidOutputError):
            _validate_judge({"winner_index": 5}, 3)

    def test_validate_critique_valid(self):
        assert _validate_critique({"issues": [], "strengths": []}) == {"issues": [], "strengths": []}

    def test_validate_critique_bad_issues(self):
        with pytest.raises(InvalidOutputError):
            _validate_critique({"issues": "not a list"})


class TestErrorClassification:
    def test_classify_capacity(self):
        assert _classify_error(AllProvidersRateLimitedError())[0] == jobs.ERR_PROVIDER_CAPACITY

    def test_classify_safety(self):
        assert _classify_error(SafetyBlockError("b"))[0] == jobs.ERR_SAFETY_BLOCK

    def test_classify_invalid_output(self):
        assert _classify_error(InvalidOutputError("b"))[0] == jobs.ERR_INVALID_OUTPUT

    def test_classify_unsupported(self):
        assert _classify_error(UnsupportedAttachmentError("i"))[0] == jobs.ERR_UNSUPPORTED_ATTACHMENT

    def test_classify_internal(self):
        assert _classify_error(RuntimeError("u"))[0] == jobs.ERR_INTERNAL_ERROR
